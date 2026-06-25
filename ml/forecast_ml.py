#!/usr/bin/env python3
# ============================================================
#  ML forecasting sidecar (Nixtla) — สถาปัตยกรรมแบบที่ชนะ M5 competition
#  - โหลด demand รายวันต่อสินค้าจาก Supabase (product_demand_daily)
#  - ฟีเจอร์: lags + วันในสัปดาห์/เดือน + "วันแคมเปญ/วันหยุดไทย" (event dummies)
#  - โมเดล: LightGBM global model (MLForecast) + AutoETS/SeasonalNaive (StatsForecast)
#  - เลือกโมเดลที่ WAPE ต่ำสุดต่อ SKU ด้วย cross-validation
#  - เขียนผล + ช่วงความเชื่อมั่น (conformal) กลับ Supabase → dashboard อ่าน
#
#  รัน:  python ml/forecast_ml.py
#  ต้องตั้ง env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (เหมือนที่แอป Next ใช้)
#  ตัวเลือก: ML_HORIZON(30) ML_LOOKBACK_DAYS(540) ML_MIN_HISTORY(35) ML_MAX_PRODUCTS(0=ไม่จำกัด)
# ============================================================
import os
import sys
import datetime as dt

import numpy as np
import pandas as pd

# ---------- ปฏิทินเหตุการณ์ไทย (สะท้อน src/lib/events.ts) ----------
CNY_DATES = {2024: "2024-02-10", 2025: "2025-01-29", 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26"}


def _last_business_day(year: int, month: int) -> int:
    d = (dt.date(year + (month // 12), (month % 12) + 1, 1) - dt.timedelta(days=1))
    while d.weekday() >= 5:  # 5,6 = เสาร์/อาทิตย์
        d -= dt.timedelta(days=1)
    return d.day


def event_tier(d: dt.date):
    """คืน tier ของวัน (None ถ้าไม่ใช่วันสำคัญ) — เลือกตัวสำคัญสุดถ้าตรงหลายอย่าง"""
    y, m, day = d.year, d.month, d.day
    hits = []
    if m == day:
        if m in (11, 12):
            hits.append(("mega", 0))
        elif m >= 6:
            hits.append(("major", 2))
        else:
            hits.append(("double", 5))
    if m == 4 and 13 <= day <= 15:
        hits.append(("songkran", 3))
    if (m == 12 and day == 31) or (m == 1 and day <= 2):
        hits.append(("newyear", 4))
    cny = CNY_DATES.get(y)
    if cny:
        cd = dt.date.fromisoformat(cny)
        if abs((d - cd).days) <= 1:
            hits.append(("cny", 1))
    if day == _last_business_day(y, m):
        hits.append(("payday", 6))
    if day == 15:
        hits.append(("midmonth", 7))
    if not hits:
        return None
    hits.sort(key=lambda x: x[1])
    return hits[0][0]


EVENT_TIERS = ["mega", "major", "double", "payday", "midmonth", "songkran", "cny", "newyear"]


def add_event_features(df: pd.DataFrame) -> pd.DataFrame:
    """เพิ่มคอลัมน์ ev_<tier> (0/1) ตามวันที่ ds"""
    tiers = df["ds"].dt.date.map(event_tier)
    for t in EVENT_TIERS:
        df[f"ev_{t}"] = (tiers == t).astype("int8")
    df["ev_any"] = (tiers.notna()).astype("int8")
    return df


# ---------- Supabase I/O ----------
def get_supabase():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        sys.exit("ต้องตั้ง SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def load_demand(sb, lookback_days: int) -> pd.DataFrame:
    """โหลด product_demand_daily ในช่วง lookback → long df [unique_id, ds, y]"""
    since = (dt.date.today() - dt.timedelta(days=lookback_days)).isoformat()
    rows, frm, page = [], 0, 1000
    while True:
        res = (
            sb.table("product_demand_daily")
            .select("product_id, date, units")
            .gte("date", since)
            .order("date")
            .range(frm, frm + page - 1)
            .execute()
        )
        data = res.data or []
        rows.extend(data)
        if len(data) < page:
            break
        frm += page
    if not rows:
        return pd.DataFrame(columns=["unique_id", "ds", "y"])
    df = pd.DataFrame(rows).rename(columns={"product_id": "unique_id", "date": "ds", "units": "y"})
    df["ds"] = pd.to_datetime(df["ds"])
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0.0)
    df["unique_id"] = df["unique_id"].astype(str)
    # รวมซ้ำวัน/สินค้า + เติมวันที่ขาด (= 0) ให้เป็นรายวันต่อเนื่อง
    df = df.groupby(["unique_id", "ds"], as_index=False)["y"].sum()
    out = []
    for uid, g in df.groupby("unique_id", sort=False):
        idx = pd.date_range(g["ds"].min(), g["ds"].max(), freq="D")
        gg = g.set_index("ds").reindex(idx).rename_axis("ds").reset_index()
        gg["unique_id"] = uid
        gg["y"] = gg["y"].fillna(0.0)
        out.append(gg[["unique_id", "ds", "y"]])
    return pd.concat(out, ignore_index=True)


def wape_by_series(cv: pd.DataFrame, model_col: str) -> pd.Series:
    """WAPE (%) ต่อ unique_id จากผล cross_validation"""
    g = cv.groupby("unique_id")
    num = g.apply(lambda d: np.abs(d["y"] - d[model_col]).sum())
    den = g["y"].sum().replace(0, np.nan)
    return (num / den * 100).fillna(999.0)


def main():
    H = int(os.environ.get("ML_HORIZON", 30))
    LOOKBACK = int(os.environ.get("ML_LOOKBACK_DAYS", 540))
    MIN_HIST = int(os.environ.get("ML_MIN_HISTORY", 35))
    MAX_PROD = int(os.environ.get("ML_MAX_PRODUCTS", 0))

    print(f"[ml] โหลด demand ย้อนหลัง {LOOKBACK} วัน …")
    sb = get_supabase()
    df = load_demand(sb, LOOKBACK)
    if df.empty:
        sys.exit("ไม่มีข้อมูล product_demand_daily (รัน npm run product-forecast ก่อน)")

    # คัดเฉพาะสินค้าที่มีประวัติพอ
    counts = df.groupby("unique_id")["ds"].count()
    keep = counts[counts >= MIN_HIST].index
    df = df[df["unique_id"].isin(keep)].copy()
    if MAX_PROD > 0:
        df = df[df["unique_id"].isin(sorted(df["unique_id"].unique())[:MAX_PROD])].copy()
    n_series = df["unique_id"].nunique()
    print(f"[ml] สินค้าที่พยากรณ์: {n_series} | แถวข้อมูล: {len(df)}")
    if n_series == 0:
        sys.exit(f"ไม่มีสินค้าที่มีประวัติ ≥{MIN_HIST} วัน")

    df = add_event_features(df)
    exog = [f"ev_{t}" for t in EVENT_TIERS] + ["ev_any"]

    # ---------- โมเดล ----------
    from statsforecast import StatsForecast
    from statsforecast.models import AutoETS, SeasonalNaive
    from mlforecast import MLForecast
    from mlforecast.utils import PredictionIntervals
    import lightgbm as lgb

    # อนาคตของ exog (ปฏิทินรู้ล่วงหน้า) → สร้าง X_df สำหรับ predict
    future_rows = []
    for uid, g in df.groupby("unique_id", sort=False):
        last = g["ds"].max()
        for k in range(1, H + 1):
            future_rows.append({"unique_id": uid, "ds": last + pd.Timedelta(days=k)})
    X_df = add_event_features(pd.DataFrame(future_rows))

    # 1) StatsForecast (สถิติ): AutoETS + SeasonalNaive (ไม่ใช้ exog)
    print("[ml] StatsForecast: AutoETS + SeasonalNaive …")
    sf = StatsForecast(models=[AutoETS(season_length=7), SeasonalNaive(season_length=7)], freq="D", n_jobs=-1)
    sf_cv = sf.cross_validation(df=df[["unique_id", "ds", "y"]], h=H, n_windows=1, step_size=H)

    # 2) MLForecast (LightGBM global) + event/date features + conformal PI
    print("[ml] MLForecast: LightGBM global model …")
    mlf = MLForecast(
        models={"LightGBM": lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=63, verbosity=-1)},
        freq="D",
        lags=[1, 7, 14, 28],
        date_features=["dayofweek", "month", "dayofyear"],
    )
    mlf_cv = mlf.cross_validation(df=df, h=H, n_windows=1, step_size=H, static_features=[])

    # ---------- เลือกโมเดลที่ดีสุดต่อ SKU (WAPE ต่ำสุด) ----------
    scores = pd.DataFrame({
        "AutoETS": wape_by_series(sf_cv, "AutoETS"),
        "SeasonalNaive": wape_by_series(sf_cv, "SeasonalNaive"),
        "LightGBM": wape_by_series(mlf_cv, "LightGBM"),
    })
    best_model = scores.idxmin(axis=1)
    best_wape = scores.min(axis=1)
    print("[ml] โมเดลที่ชนะ (นับสินค้า):")
    print(best_model.value_counts().to_string())

    # ---------- พยากรณ์จริง (refit เต็ม) ----------
    print("[ml] พยากรณ์ล่วงหน้า …")
    sf_fc = sf.forecast(df=df[["unique_id", "ds", "y"]], h=H, level=[80])
    mlf.fit(df, static_features=[], prediction_intervals=PredictionIntervals(n_windows=2, h=H))
    mlf_fc = mlf.predict(h=H, X_df=X_df, level=[80])

    # รวมผลตามโมเดลที่เลือกของแต่ละสินค้า
    parts = []
    for uid, model in best_model.items():
        if model == "LightGBM":
            src = mlf_fc[mlf_fc["unique_id"] == uid]
            yh, lo, hi = "LightGBM", "LightGBM-lo-80", "LightGBM-hi-80"
        else:
            src = sf_fc[sf_fc["unique_id"] == uid]
            yh, lo, hi = model, f"{model}-lo-80", f"{model}-hi-80"
        if src.empty:
            continue
        p = pd.DataFrame({
            "product_id": uid,
            "ds": src["ds"].dt.date.astype(str),
            "yhat": src[yh].clip(lower=0).round(2),
            "yhat_lower": (src[lo].clip(lower=0) if lo in src.columns else src[yh].clip(lower=0)).round(2),
            "yhat_upper": (src[hi] if hi in src.columns else src[yh]).round(2),
        })
        parts.append(p)
    fc_out = pd.concat(parts, ignore_index=True)
    fc_out["generated_at"] = dt.datetime.utcnow().isoformat()

    meta_out = pd.DataFrame({
        "product_id": best_model.index,
        "model": best_model.values,
        "wape": best_wape.round(1).values,
        "n_history": counts.reindex(best_model.index).values,
        "horizon": H,
        "generated_at": dt.datetime.utcnow().isoformat(),
    })

    # ---------- เขียนกลับ Supabase ----------
    print(f"[ml] เขียนผล {len(fc_out)} แถว → product_forecast_ml …")
    recs = fc_out.to_dict("records")
    for i in range(0, len(recs), 500):
        sb.table("product_forecast_ml").upsert(recs[i:i + 500], on_conflict="product_id,ds").execute()
    mrecs = meta_out.to_dict("records")
    for i in range(0, len(mrecs), 500):
        sb.table("product_forecast_ml_meta").upsert(mrecs[i:i + 500], on_conflict="product_id").execute()

    print(f"[ml] เสร็จ ✓ — {n_series} สินค้า, horizon {H} วัน, WAPE เฉลี่ย {best_wape.mean():.1f}%")


if __name__ == "__main__":
    main()
