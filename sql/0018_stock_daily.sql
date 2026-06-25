-- ============================================================
--  0018 — ประวัติสต๊อกรายวัน (สำหรับวิเคราะห์ "วันของหมด" / censored demand)
--  pipeline จะบันทึก snapshot สต๊อกของวันนี้ทุกครั้งที่รัน → สะสมเป็นประวัติ
-- ============================================================

create table if not exists public.product_stock_daily (
  product_id text,
  date       date,
  stock      numeric,        -- คงเหลือพร้อมขาย ณ วันนั้น
  reserved   numeric,        -- ถูกจอง
  updated_at timestamptz default now(),
  primary key (product_id, date)
);
create index if not exists idx_psd_product on public.product_stock_daily (product_id);
create index if not exists idx_psd_date    on public.product_stock_daily (date);

alter table public.product_stock_daily enable row level security;
