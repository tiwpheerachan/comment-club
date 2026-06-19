"""ดึงคอมเมนต์จาก BigQuery แบบ mapping คอลัมน์ยืดหยุ่น"""
from __future__ import annotations

import datetime as dt
from typing import Any

from .config import get_config


def _bq():
    """import แบบ lazy เพื่อให้โมดูลอื่นใช้ได้แม้ยังไม่ติดตั้ง google-cloud-bigquery"""
    from google.cloud import bigquery
    return bigquery


def _col(cfg: dict, name: str) -> str | None:
    return cfg["columns"].get(name)


def _select_expr(cfg: dict) -> str:
    """สร้าง SELECT โดย alias เป็นชื่อมาตรฐาน ข้ามคอลัมน์ที่ไม่ได้ตั้งค่า"""
    parts = []
    for std_name in [
        "comment_id", "brand", "shop_name", "product_name", "product_id",
        "rating", "comment_text", "username", "created_at", "order_id",
    ]:
        real = _col(cfg, std_name)
        if real:
            parts.append(f"`{real}` AS {std_name}")
        else:
            parts.append(f"NULL AS {std_name}")
    return ",\n  ".join(parts)


def fetch_comments(
    lookback_days: int | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """
    ดึงคอมเมนต์ในช่วง lookback_days วันล่าสุด
    คืนค่าเป็น list ของ dict ที่ key เป็นชื่อมาตรฐาน
    """
    cfg = get_config()
    bq = cfg["bigquery"]
    pl = cfg["pipeline"]

    lookback_days = lookback_days if lookback_days is not None else pl.get("lookback_days", 1)
    if limit is None:
        limit = pl.get("max_comments_per_run", 0) or None

    created_col = _col(cfg, "created_at")
    fq_table = f"`{bq['project_id']}.{bq['dataset']}.{bq['table']}`"

    where = (
        f"TIMESTAMP({created_col}) >= TIMESTAMP_SUB("
        f"CURRENT_TIMESTAMP(), INTERVAL @days DAY)"
    )
    query = f"""
        SELECT
          {_select_expr(cfg)}
        FROM {fq_table}
        WHERE {where}
        ORDER BY TIMESTAMP({created_col}) DESC
        {f'LIMIT {int(limit)}' if limit else ''}
    """

    bigquery = _bq()
    client = bigquery.Client(project=bq["project_id"], location=bq.get("location"))
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("days", "INT64", lookback_days)]
    )
    rows = client.query(query, job_config=job_config).result()

    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        # แปลง datetime เป็น ISO string เพื่อให้ serialize ได้
        ca = d.get("created_at")
        if isinstance(ca, (dt.datetime, dt.date)):
            d["created_at"] = ca.isoformat()
        out.append(d)
    return out


def list_brands() -> list[str]:
    """ดึงรายชื่อแบรนด์ที่มีในตาราง (ใช้เติม dropdown / ตรวจสอบ)"""
    cfg = get_config()
    bq = cfg["bigquery"]
    brand_col = _col(cfg, "brand")
    fq_table = f"`{bq['project_id']}.{bq['dataset']}.{bq['table']}`"
    query = f"SELECT DISTINCT `{brand_col}` AS brand FROM {fq_table} WHERE `{brand_col}` IS NOT NULL"
    client = _bq().Client(project=bq["project_id"], location=bq.get("location"))
    return [r["brand"] for r in client.query(query).result()]


def healthcheck() -> bool:
    """ทดสอบว่าเชื่อม BigQuery ได้หรือไม่"""
    cfg = get_config()
    bq = cfg["bigquery"]
    client = _bq().Client(project=bq["project_id"], location=bq.get("location"))
    client.query("SELECT 1").result()
    return True
