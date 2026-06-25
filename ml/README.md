# ML Forecasting Sidecar (Nixtla)

พยากรณ์ดีมานด์รายสินค้าด้วยสถาปัตยกรรมแบบที่ชนะ **M5 competition**:
**LightGBM global model** (MLForecast) + **AutoETS/SeasonalNaive** (StatsForecast) แล้วเลือกตัวที่ WAPE ต่ำสุดต่อ SKU ด้วย cross-validation พร้อมช่วงความเชื่อมั่น (conformal prediction)

ฟีเจอร์ที่ใช้: lags (1/7/14/28 วัน) + วันในสัปดาห์/เดือน/วันในปี + **วันแคมเปญ/วันหยุดไทย** (mega/major/payday/สงกรานต์/ตรุษจีน/ปีใหม่ — ตรงกับ `src/lib/events.ts`)

## ขั้นตอน

```bash
# 1) สร้าง virtualenv + ติดตั้ง
python3 -m venv ml/.venv
source ml/.venv/bin/activate
pip install -r ml/requirements.txt

# 2) รัน migration ให้มีตารางผลลัพธ์ (ทำครั้งเดียว)
npm run migrate          # สร้าง product_forecast_ml + _meta (sql/0019)

# 3) ตั้ง env (ชุดเดียวกับที่แอป Next ใช้)
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."

# 4) รัน (ต้องมีข้อมูลใน product_demand_daily ก่อน — จาก `npm run product-forecast`)
python ml/forecast_ml.py
```

ผลจะถูกเขียนลง `product_forecast_ml` (ค่าพยากรณ์รายวัน + ขอบบน/ล่าง) และ `product_forecast_ml_meta` (โมเดลที่เลือก + WAPE) → หน้า **สต๊อก/รายสินค้า** ในแดชบอร์ดจะแสดงเส้น "ML (Nixtla)" ทับให้อัตโนมัติ

## ตัวเลือก (env)

| ตัวแปร | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `ML_HORIZON` | 30 | พยากรณ์กี่วันข้างหน้า |
| `ML_LOOKBACK_DAYS` | 540 | ใช้ประวัติย้อนหลังกี่วัน |
| `ML_MIN_HISTORY` | 35 | สินค้าต้องมีประวัติ ≥ กี่วันถึงจะพยากรณ์ |
| `ML_MAX_PRODUCTS` | 0 | จำกัดจำนวนสินค้า (0 = ไม่จำกัด, ใช้ทดสอบ) |

## รันอัตโนมัติ (แนะนำ)

ตั้ง cron วันละครั้งหลัง `npm run product-forecast`:
```cron
30 6 * * *  cd /path/to/app && ./ml/.venv/bin/python ml/forecast_ml.py >> ml/forecast.log 2>&1
```

## หมายเหตุ
- ครั้งแรกที่รัน LightGBM/StatsForecast จะ build (numba) สักครู่ — ครั้งต่อไปเร็วขึ้น
- ถ้าสินค้าน้อย/ข้อมูลสั้น โมเดลสถิติ (AutoETS) มักชนะ; ถ้าสินค้าเยอะที่สัมพันธ์กัน LightGBM global จะได้เปรียบ (cross-learning)
