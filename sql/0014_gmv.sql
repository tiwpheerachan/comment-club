-- ============================================================
--  0014 — ยอดขายรายวัน (สำหรับ Forecasting) จาก Canonical.product_gmv_daily + order_financials
-- ============================================================
create table if not exists public.gmv_daily (
  scope      text,        -- 'ALL' | 'platform:<p>' | 'brand:<b>'
  date       date,
  gmv        numeric,
  units      numeric,
  net_sales  numeric,
  updated_at timestamptz default now(),
  primary key (scope, date)
);
create index if not exists idx_gmv_scope_date on public.gmv_daily (scope, date);

alter table public.gmv_daily enable row level security;
