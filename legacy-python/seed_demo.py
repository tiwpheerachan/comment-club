"""
สร้างข้อมูลตัวอย่าง (ไม่ต้องต่อ BigQuery) เพื่อทดสอบ dashboard
รัน:  python seed_demo.py
จากนั้น:  uvicorn app.server:app  แล้วเปิด http://localhost:8000
"""
from __future__ import annotations

import datetime as dt
import json
import random

from app.analyzer import analyze
from app.config import data_dir
from app.pipeline import aggregate

BRANDS = ["GlowSkin", "PureVita", "DailyMax", "HomeFresh"]
PRODUCTS = ["เซรั่มวิตามินซี", "ครีมกันแดด", "อาหารเสริม", "สบู่สมุนไพร", "โลชั่นบำรุง"]

GOOD = [
    "ของดีมากกก ใช้แล้วผิวดีขึ้น ส่งเร็วด้วย ประทับใจ",
    "ตรงปก คุ้มราคา จะกลับมาซื้ออีก",
    "แพ็คดีมาก ร้านบริการน่ารัก แนะนำเลย",
    "ใช้ดีจริง หน้าใสขึ้นเยอะ ขอบคุณค่ะ",
]
NEUTRAL = [
    "ของได้แล้ว ยังไม่ได้ลองใช้",
    "สินค้าโอเค แต่กล่องบุบนิดหน่อย",
    "ส่งช้าไปนิดแต่ของครบดี",
]
BAD = [
    "ของมาช้ามาก รอเป็นอาทิตย์ ผิดหวัง",
    "สินค้าไม่ตรงปกเลย สีไม่เหมือนรูป",
    "ใช้แล้วแพ้ ขึ้นผื่นแดงทั้งหน้า อันตรายมาก",
    "สั่งไป 2 อาทิตย์แล้วยังไม่ได้ของ ทักแชทร้านเงียบ ติดต่อไม่ได้ จะขอคืนเงิน",
    "ได้ของปลอม ไม่ใช่ของแท้ โกงชัด ๆ จะฟ้องร้อง สคบ.",
    "ครีมหมดอายุ ใช้ไม่ได้เลย แย่มาก",
]


def make_comments(n: int = 120) -> list[dict]:
    rows = []
    for i in range(n):
        roll = random.random()
        if roll < 0.5:
            text, rating = random.choice(GOOD), random.choice([4, 5, 5])
        elif roll < 0.7:
            text, rating = random.choice(NEUTRAL), 3
        else:
            text, rating = random.choice(BAD), random.choice([1, 1, 2])
        rows.append({
            "comment_id": f"demo-{i}",
            "brand": random.choice(BRANDS),
            "product_name": random.choice(PRODUCTS),
            "rating": rating,
            "comment_text": text,
            "username": f"user{i:03d}",
            "created_at": dt.datetime.now().isoformat(),
        })
    return rows


def main() -> None:
    print("สร้างข้อมูลตัวอย่าง 120 คอมเมนต์ (ใช้ rule-based, ไม่เรียก AI)")
    comments = make_comments()
    results = analyze(comments)  # ถ้าไม่ได้ตั้ง ANTHROPIC_API_KEY จะ fallback rule-based
    summary = aggregate(results)

    d = data_dir()
    (d / "latest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    # สร้าง trend ย้อนหลัง 14 วันแบบสุ่มเล็กน้อย
    trend = []
    base = summary["overall"]["sentiment_score"]
    for k in range(14, 0, -1):
        day = (dt.date.today() - dt.timedelta(days=k)).isoformat()
        trend.append({
            "date": day,
            "overall_score": round(base + random.uniform(-20, 20), 1),
            "total": random.randint(80, 150),
            "urgent": random.randint(2, 12),
            "brands": {b["brand"]: round(b["sentiment_score"] + random.uniform(-15, 15), 1)
                       for b in summary["brands"]},
        })
    trend.append({
        "date": dt.date.today().isoformat(),
        "overall_score": summary["overall"]["sentiment_score"],
        "total": summary["total_comments"],
        "urgent": summary["urgent_total"],
        "brands": {b["brand"]: b["sentiment_score"] for b in summary["brands"]},
    })
    (d / "trend.json").write_text(json.dumps(trend, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"เสร็จ! ทิศทางรวม {summary['overall']['direction']} "
          f"({summary['overall']['sentiment_score']}), ด่วน {summary['urgent_total']} รายการ")
    print("ต่อไป: uvicorn app.server:app  แล้วเปิด http://localhost:8000")


if __name__ == "__main__":
    main()
