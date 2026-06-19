"""
FastAPI server:
  - เสิร์ฟหน้า dashboard (frontend/index.html)
  - API: /api/summary, /api/trend, /api/urgent, /api/refresh, /api/health
  - ตั้ง scheduler รัน pipeline อัตโนมัติทุกวัน
"""
from __future__ import annotations

import os
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import pipeline

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

app = FastAPI(title="Shopee Comment AI")
scheduler = BackgroundScheduler(timezone="Asia/Bangkok")


@app.on_event("startup")
def _startup() -> None:
    # รัน pipeline ทุกวันเวลา 07:00 (เวลาไทย) ปรับได้
    scheduler.add_job(_safe_run, "cron", hour=7, minute=0, id="daily")
    scheduler.start()
    print("[server] scheduler เริ่มทำงาน: รันทุกวัน 07:00 (Asia/Bangkok)")


@app.on_event("shutdown")
def _shutdown() -> None:
    scheduler.shutdown(wait=False)


def _safe_run() -> None:
    try:
        pipeline.run()
    except Exception as e:  # noqa: BLE001
        print(f"[server] pipeline ล้มเหลว: {e}")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/summary")
def summary() -> JSONResponse:
    data = pipeline.load_latest()
    if data is None:
        raise HTTPException(404, "ยังไม่มีข้อมูล โปรดเรียก /api/refresh ก่อน")
    return JSONResponse(data)


@app.get("/api/trend")
def trend() -> JSONResponse:
    return JSONResponse(pipeline.load_trend())


@app.get("/api/urgent")
def urgent() -> JSONResponse:
    data = pipeline.load_latest()
    if data is None:
        return JSONResponse([])
    return JSONResponse(data.get("urgent", []))


@app.post("/api/refresh")
def refresh() -> JSONResponse:
    """สั่งรัน pipeline ทันที (ดึง+วิเคราะห์ใหม่)"""
    data = pipeline.run()
    return JSONResponse({"ok": True, "summary": {
        "total": data["total_comments"],
        "direction": data["overall"]["direction"],
        "urgent": data["urgent_total"],
    }})


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html")


# เสิร์ฟไฟล์ static อื่น ๆ (ถ้ามี)
if FRONTEND.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


def main() -> None:
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.server:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
