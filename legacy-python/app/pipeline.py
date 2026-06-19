"""
Pipeline รายวัน:
  1) ดึงคอมเมนต์จาก BigQuery
  2) วิเคราะห์ด้วย AI
  3) รวมผล (aggregate) ต่อแบรนด์ + ภาพรวม
  4) บันทึกเป็น JSON ในโฟลเดอร์ data/
ผลล่าสุดเก็บเป็น latest.json และเก็บ snapshot รายวันไว้ดูเทรนด์
"""
from __future__ import annotations

import datetime as dt
import json
from collections import Counter, defaultdict
from typing import Any

from .analyzer import analyze
from .bigquery_client import fetch_comments
from .config import data_dir, get_config


def _sentiment_score(counter: Counter) -> float:
    """คะแนนทิศทาง -100..100 (บวก=ดี, ลบ=แย่)"""
    pos = counter.get("positive", 0)
    neg = counter.get("negative", 0)
    total = sum(counter.values())
    if total == 0:
        return 0.0
    return round((pos - neg) / total * 100, 1)


def _direction_label(score: float) -> str:
    if score >= 40:
        return "ดีมาก"
    if score >= 15:
        return "ค่อนข้างดี"
    if score > -15:
        return "ทรงตัว/ผสม"
    if score > -40:
        return "ค่อนข้างแย่"
    return "แย่ ต้องรีบแก้"


def aggregate(results: list[dict]) -> dict[str, Any]:
    """สร้างสรุปภาพรวม + รายแบรนด์"""
    overall_sent = Counter()
    overall_cat = Counter()
    by_brand: dict[str, dict] = defaultdict(
        lambda: {
            "sentiment": Counter(),
            "category": Counter(),
            "issues": Counter(),
            "ratings": [],
            "count": 0,
        }
    )

    urgent: list[dict] = []

    for r in results:
        brand = r.get("brand") or "ไม่ระบุแบรนด์"
        sent = r.get("sentiment", "neutral")
        cat = r.get("category", "อื่น ๆ")

        overall_sent[sent] += 1
        overall_cat[cat] += 1

        b = by_brand[brand]
        b["sentiment"][sent] += 1
        b["category"][cat] += 1
        b["count"] += 1
        if sent == "negative" and cat != "เชิงบวก/ชม":
            b["issues"][cat] += 1
        try:
            b["ratings"].append(float(r.get("rating")))
        except (TypeError, ValueError):
            pass

        if r.get("urgent"):
            urgent.append(r)

    # จัดอันดับ urgent ตามความรุนแรง
    urgent.sort(key=lambda x: x.get("severity", 0), reverse=True)

    brands_out = []
    for brand, b in by_brand.items():
        score = _sentiment_score(b["sentiment"])
        avg_rating = round(sum(b["ratings"]) / len(b["ratings"]), 2) if b["ratings"] else None
        brands_out.append({
            "brand": brand,
            "count": b["count"],
            "sentiment": dict(b["sentiment"]),
            "sentiment_score": score,
            "direction": _direction_label(score),
            "avg_rating": avg_rating,
            "top_issues": [
                {"category": c, "count": n} for c, n in b["issues"].most_common(5)
            ],
            "urgent_count": sum(1 for u in urgent if (u.get("brand") or "ไม่ระบุแบรนด์") == brand),
        })
    # แบรนด์ที่แย่สุดอยู่บน
    brands_out.sort(key=lambda x: x["sentiment_score"])

    overall_score = _sentiment_score(overall_sent)
    return {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "total_comments": len(results),
        "overall": {
            "sentiment": dict(overall_sent),
            "sentiment_score": overall_score,
            "direction": _direction_label(overall_score),
            "top_categories": [
                {"category": c, "count": n} for c, n in overall_cat.most_common(8)
            ],
        },
        "brands": brands_out,
        "urgent": urgent[:100],
        "urgent_total": len(urgent),
    }


def _append_trend(summary: dict) -> None:
    """เก็บคะแนนรายวันลง trend.json เพื่อดูแนวโน้ม"""
    path = data_dir() / "trend.json"
    trend = []
    if path.exists():
        trend = json.loads(path.read_text(encoding="utf-8"))
    today = dt.date.today().isoformat()
    trend = [t for t in trend if t["date"] != today]  # กันซ้ำถ้ารันหลายรอบ/วัน
    entry = {
        "date": today,
        "overall_score": summary["overall"]["sentiment_score"],
        "total": summary["total_comments"],
        "urgent": summary["urgent_total"],
        "brands": {b["brand"]: b["sentiment_score"] for b in summary["brands"]},
    }
    trend.append(entry)
    trend = trend[-90:]  # เก็บ 90 วันล่าสุด
    path.write_text(json.dumps(trend, ensure_ascii=False, indent=2), encoding="utf-8")


def run(lookback_days: int | None = None) -> dict:
    """รัน pipeline เต็มรอบ คืน summary"""
    get_config()
    print("[pipeline] ดึงคอมเมนต์จาก BigQuery ...")
    comments = fetch_comments(lookback_days=lookback_days)
    print(f"[pipeline] ได้ {len(comments)} คอมเมนต์")

    if not comments:
        summary = aggregate([])
    else:
        print("[pipeline] วิเคราะห์ด้วย AI ...")
        results = analyze(comments)
        summary = aggregate(results)
        # เก็บผลรายคอมเมนต์ของวันไว้ด้วย
        day = dt.date.today().isoformat()
        (data_dir() / f"comments_{day}.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    (data_dir() / "latest.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _append_trend(summary)
    print(f"[pipeline] เสร็จ: ทิศทางรวม {summary['overall']['direction']} "
          f"({summary['overall']['sentiment_score']}), ด่วน {summary['urgent_total']} รายการ")
    return summary


def load_latest() -> dict | None:
    path = data_dir() / "latest.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def load_trend() -> list:
    path = data_dir() / "trend.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


if __name__ == "__main__":
    run()
