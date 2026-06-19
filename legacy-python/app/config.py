"""โหลดและตรวจสอบ config.yaml ใช้ร่วมกันทุกโมดูล"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = Path(os.getenv("CONFIG_PATH", ROOT / "config.yaml"))


@lru_cache(maxsize=1)
def get_config() -> dict[str, Any]:
    """อ่าน config.yaml (cache ไว้ครั้งเดียว)"""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    _validate(cfg)
    return cfg


def _validate(cfg: dict[str, Any]) -> None:
    required_top = ["bigquery", "columns", "urgent_rules", "ai", "pipeline"]
    for key in required_top:
        if key not in cfg:
            raise ValueError(f"config.yaml ขาดส่วน '{key}'")

    cols = cfg["columns"]
    for must in ["comment_id", "brand", "comment_text", "created_at"]:
        if not cols.get(must):
            raise ValueError(
                f"columns.{must} ต้องระบุ (แก้ใน config.yaml ให้ตรงกับชื่อคอลัมน์จริง)"
            )


def data_dir() -> Path:
    """โฟลเดอร์เก็บผลวิเคราะห์ (สร้างให้อัตโนมัติ)"""
    d = ROOT / get_config()["pipeline"].get("output_dir", "data")
    d.mkdir(parents=True, exist_ok=True)
    return d
