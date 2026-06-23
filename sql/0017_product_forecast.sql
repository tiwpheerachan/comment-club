-- ============================================================
--  0017 — พยากรณ์สินค้า & สต๊อก + ปัจจัยแวดล้อม
-- ============================================================

-- ปัจจัยแวดล้อมรายวัน (กรุงเทพฯ เป็นตัวแทน) จาก Open-Meteo
create table if not exists public.env_daily (
  date       date primary key,
  pm2_5      numeric,
  temp_mean  numeric,
  temp_max   numeric,
  precip     numeric,
  updated_at timestamptz default now()
);

-- ยอดขายรายวันรายสินค้า (เฉพาะวันที่มียอด) — ใช้พยากรณ์ดีมานด์
create table if not exists public.product_demand_daily (
  product_id text,
  date       date,
  units      numeric,
  gmv        numeric,
  primary key (product_id, date)
);
create index if not exists idx_pdd_product on public.product_demand_daily (product_id);

-- ทะเบียน + สต๊อกล่าสุดต่อสินค้า
create table if not exists public.product_catalog (
  product_id   text primary key,
  platform     text,
  name         text,
  brand        text,
  stock        numeric,        -- คงเหลือพร้อมขาย
  reserved     numeric,        -- ถูกจอง
  stock_at     timestamptz,    -- เวลาที่ดึงสต๊อก
  -- สรุปดีมานด์ (เติมตอน sync เพื่อเรียง/กรองเร็ว)
  avg_daily_30 numeric,
  avg_daily_90 numeric,
  units_90     numeric,
  updated_at   timestamptz default now()
);
create index if not exists idx_pc_brand on public.product_catalog (brand);

alter table public.env_daily enable row level security;
alter table public.product_demand_daily enable row level security;
alter table public.product_catalog enable row level security;
