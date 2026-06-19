"""
สคริปต์รัน pipeline แบบ one-shot (เหมาะกับ cron / Cloud Scheduler)
รัน:  python run_daily.py [จำนวนวันย้อนหลัง]
ตัวอย่าง cron รันทุกวัน 07:00 :
  0 7 * * * cd /path/shopee-comment-ai && /usr/bin/python run_daily.py >> cron.log 2>&1
"""
import sys

from app.pipeline import run

if __name__ == "__main__":
    days = int(sys.argv[1]) if len(sys.argv) > 1 else None
    run(lookback_days=days)
