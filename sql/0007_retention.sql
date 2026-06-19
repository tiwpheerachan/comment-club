-- ============================================================
--  0007 — Customer Retention (สรุปจาก shopee_orders / shopee_order_items)
-- ============================================================
create table if not exists public.retention_summary (
  scope            text primary key,   -- 'ALL' หรือ brand_id
  customers        int,
  repeat_customers int,
  one_time         int,
  total_orders     int,
  repeat_rate      numeric,            -- %
  avg_orders       numeric,
  updated_at       timestamptz default now()
);

create table if not exists public.retention_monthly (
  month               date primary key,
  new_customers       int,
  returning_customers int,
  orders              int
);

create table if not exists public.retention_distribution (
  bucket    text primary key,          -- '1','2','3','4','5+'
  customers int
);

create table if not exists public.top_customers (
  buyer       text primary key,
  orders      int,
  spend       numeric,
  first_order date,
  last_order  date,
  brands      text,
  updated_at  timestamptz default now()
);

alter table public.retention_summary      enable row level security;
alter table public.retention_monthly      enable row level security;
alter table public.retention_distribution enable row level security;
alter table public.top_customers          enable row level security;
