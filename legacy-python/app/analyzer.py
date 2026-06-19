"""
วิเคราะห์คอมเมนต์ทีละชุด (batch) ด้วย Claude
ผลลัพธ์ต่อคอมเมนต์: sentiment, หมวดปัญหา, ความรุนแรง, สรุปสั้น, action แนะนำ, ธงด่วน
มี fallback แบบ rule-based เมื่อ AI ปิดอยู่หรือเรียกไม่สำเร็จ
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

from .config import get_config

# ---------- ส่วน rule-based (ใช้เสริม/สำรอง) ----------

_POSITIVE_WORDS = [
    "ดี", "ชอบ", "ประทับใจ", "คุ้ม", "เร็ว", "สวย", "ของแท้", "แนะนำ",
    "ถูกใจ", "ใช้ดี", "ตรงปก", "บริการดี", "great", "good", "love", "nice",
]
_NEGATIVE_WORDS = [
    "แย่", "ห่วย", "ช้า", "พัง", "เสีย", "ผิด", "ไม่ดี", "ไม่ตรงปก",
    "ปลอม", "โกง", "หลอก", "ผิดหวัง", "แพง", "bad", "terrible", "slow", "broken",
]


def _rule_sentiment(text: str, rating: Any) -> str:
    t = (text or "").lower()
    score = sum(w in t for w in _POSITIVE_WORDS) - sum(w in t for w in _NEGATIVE_WORDS)
    try:
        r = float(rating)
        if r >= 4:
            score += 1
        elif r <= 2:
            score -= 2
    except (TypeError, ValueError):
        pass
    if score > 0:
        return "positive"
    if score < 0:
        return "negative"
    return "neutral"


def _hits_red_flag(text: str, keywords: list[str]) -> bool:
    t = (text or "").lower()
    return any(k.lower() in t for k in keywords)


def rule_based_one(c: dict, cfg: dict) -> dict:
    """วิเคราะห์ 1 คอมเมนต์แบบไม่ใช้ AI"""
    rules = cfg["urgent_rules"]
    text = c.get("comment_text") or ""
    rating = c.get("rating")
    sentiment = _rule_sentiment(text, rating)
    red = _hits_red_flag(text, rules.get("red_flag_keywords", []))

    low_rating = False
    try:
        low_rating = float(rating) <= rules.get("rating_threshold", 2)
    except (TypeError, ValueError):
        pass

    severity = 0
    if sentiment == "negative":
        severity = 6
    if low_rating:
        severity = max(severity, 7)
    if red:
        severity = max(severity, 9)

    urgent = red or low_rating or severity >= rules.get("severity_threshold", 7)
    return {
        "sentiment": sentiment,
        "category": "เชิงบวก/ชม" if sentiment == "positive" else "อื่น ๆ",
        "severity": severity,
        "summary": text[:80],
        "suggested_action": "ติดต่อลูกค้าเพื่อช่วยเหลือ" if urgent else "",
        "urgent": bool(urgent),
        "analyzed_by": "rule",
    }


# ---------- ส่วน AI (Claude) ----------

_SYSTEM_PROMPT = """คุณคือผู้ช่วยวิเคราะห์รีวิว/คอมเมนต์ลูกค้าของร้านค้าบน Shopee
หน้าที่ของคุณคืออ่านคอมเมนต์แต่ละรายการแล้วประเมินอย่างเป็นกลางและแม่นยำ
ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON"""


def _build_prompt(batch: list[dict], cfg: dict) -> str:
    cats = cfg["issue_categories"]
    items = []
    for i, c in enumerate(batch):
        items.append(
            f"[{i}] แบรนด์: {c.get('brand')} | สินค้า: {c.get('product_name')} | "
            f"ดาว: {c.get('rating')} | ข้อความ: {c.get('comment_text')}"
        )
    joined = "\n".join(items)
    cat_list = ", ".join(f'"{c}"' for c in cats)
    return f"""วิเคราะห์คอมเมนต์ต่อไปนี้ทีละรายการ (index ตรงกับเลขในวงเล็บ):

{joined}

สำหรับแต่ละรายการให้คืน object ที่มี field:
- "index": เลข index (int)
- "sentiment": หนึ่งใน "positive" / "neutral" / "negative"
- "category": เลือกจาก [{cat_list}]
- "severity": 0-10 (0=ไม่มีปัญหา, 10=วิกฤตต้องรีบแก้ทันที เช่น แพ้/อันตราย/ถูกโกง)
- "summary": สรุปประเด็นสั้น ๆ เป็นภาษาไทย ไม่เกิน 100 ตัวอักษร
- "suggested_action": สิ่งที่ทีมควรทำต่อ เป็นภาษาไทย (ถ้าเป็นคอมเมนต์เชิงบวกให้เว้นว่าง "")
- "urgent": true เฉพาะกรณีที่ทีมต้องรีบเข้าไปช่วยเหลือ/แก้ไขโดยเร็ว (เช่น ปัญหาความปลอดภัย ลูกค้าโกรธมาก ขู่ฟ้อง ไม่ได้รับของ)

ตอบเป็น JSON object เดียวรูปแบบ: {{"results": [ ... ]}} โดยเรียงตาม index"""


def _ai_analyze_batch(batch: list[dict], cfg: dict) -> list[dict] | None:
    """เรียก Claude วิเคราะห์ 1 batch; คืน None ถ้าล้มเหลว (ให้ fallback ทำต่อ)"""
    try:
        import anthropic
    except ImportError:
        return None
    if not os.getenv("ANTHROPIC_API_KEY"):
        return None

    client = anthropic.Anthropic()
    try:
        resp = client.messages.create(
            model=cfg["ai"]["model"],
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_prompt(batch, cfg)}],
        )
        raw = resp.content[0].text
    except Exception as e:  # noqa: BLE001
        print(f"[analyzer] เรียก AI ไม่สำเร็จ: {e}")
        return None

    parsed = _extract_json(raw)
    if not parsed or "results" not in parsed:
        return None
    return parsed["results"]


def _extract_json(raw: str) -> dict | None:
    """ดึง JSON object ออกจากข้อความ (กันกรณีมี markdown fence)"""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _merge(base: dict, ai: dict, cfg: dict) -> dict:
    """รวมผล AI เข้ากับ enrichment + บังคับกฎ urgent จาก config"""
    rules = cfg["urgent_rules"]
    text = base.get("comment_text") or ""
    rating = base.get("rating")

    result = {
        "comment_id": base.get("comment_id"),
        "brand": base.get("brand"),
        "product_name": base.get("product_name"),
        "rating": rating,
        "username": base.get("username"),
        "created_at": base.get("created_at"),
        "comment_text": text,
        "sentiment": ai.get("sentiment", "neutral"),
        "category": ai.get("category", "อื่น ๆ"),
        "severity": int(ai.get("severity", 0) or 0),
        "summary": ai.get("summary", "")[:120],
        "suggested_action": ai.get("suggested_action", ""),
        "urgent": bool(ai.get("urgent", False)),
        "analyzed_by": "ai",
    }

    # บังคับกฎ override จาก config (กันโมเดลพลาดเคสด่วน)
    if _hits_red_flag(text, rules.get("red_flag_keywords", [])):
        result["urgent"] = True
        result["severity"] = max(result["severity"], 9)
    try:
        if float(rating) <= rules.get("rating_threshold", 2):
            result["urgent"] = True
            result["severity"] = max(result["severity"], 7)
    except (TypeError, ValueError):
        pass
    if result["severity"] >= rules.get("severity_threshold", 7):
        result["urgent"] = True
    return result


def analyze(comments: list[dict]) -> list[dict]:
    """
    วิเคราะห์คอมเมนต์ทั้งหมด คืน list ของผลที่ enrich แล้ว
    ใช้ AI ถ้าเปิดใช้งานและเรียกสำเร็จ มิฉะนั้นใช้ rule-based
    """
    cfg = get_config()
    use_ai = cfg["ai"].get("enabled", True)
    batch_size = cfg["ai"].get("batch_size", 15)

    results: list[dict] = []
    for start in range(0, len(comments), batch_size):
        batch = comments[start:start + batch_size]
        ai_results = _ai_analyze_batch(batch, cfg) if use_ai else None

        if ai_results:
            by_index = {int(r.get("index", -1)): r for r in ai_results}
            for i, c in enumerate(batch):
                ai = by_index.get(i)
                if ai:
                    results.append(_merge(c, ai, cfg))
                else:
                    results.append(_merge(c, rule_based_one(c, cfg), cfg))
        else:
            for c in batch:
                results.append(_merge(c, rule_based_one(c, cfg), cfg))
    return results
