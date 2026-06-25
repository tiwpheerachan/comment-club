-- ============================================================
--  0019 — ผลพยากรณ์จาก ML sidecar (Nixtla: StatsForecast + MLForecast/LightGBM)
--  Python script (ml/forecast_ml.py) เขียนผลลงตารางนี้ → dashboard อ่านไปแสดง
-- ============================================================

-- ค่าพยากรณ์รายวันต่อสินค้า (จากโมเดลที่เลือกต่อ SKU)
create table if not exists public.product_forecast_ml (
  product_id  text,
  ds          date,             -- วันที่พยากรณ์ (อนาคต)
  yhat        numeric,          -- ค่าพยากรณ์
  yhat_lower  numeric,          -- ขอบล่าง (เช่น quantile 10%)
  yhat_upper  numeric,          -- ขอบบน (quantile 90%)
  generated_at timestamptz default now(),
  primary key (product_id, ds)
);
create index if not exists idx_pfml_product on public.product_forecast_ml (product_id);

-- เมตาต่อสินค้า: โมเดลที่เลือก + ความแม่นจาก backtest
create table if not exists public.product_forecast_ml_meta (
  product_id   text primary key,
  model        text,            -- ชื่อโมเดลที่ชนะ (เช่น LightGBM, AutoETS)
  wape         numeric,         -- ความคลาดเคลื่อน (%) จาก cross-validation
  n_history    int,             -- จำนวนวันข้อมูลที่ใช้
  horizon      int,             -- พยากรณ์กี่วัน
  generated_at timestamptz default now()
);

alter table public.product_forecast_ml enable row level security;
alter table public.product_forecast_ml_meta enable row level security;
