-- ============================================================
--  0008 — Retention เชิงลึก: cohort, RFM, win-back, KPI
-- ============================================================
create table if not exists public.retention_cohort (
  cohort       text,        -- เดือนที่ได้ลูกค้ามา (YYYY-MM-DD)
  months_since int,         -- ผ่านไปกี่เดือน
  customers    int,
  primary key (cohort, months_since)
);

create table if not exists public.rfm_segments (
  segment       text primary key,
  customers     int,
  avg_recency   numeric,
  avg_frequency numeric,
  avg_monetary  numeric,
  total_spend   numeric,
  updated_at    timestamptz default now()
);

create table if not exists public.at_risk_customers (
  buyer      text primary key,
  orders     int,
  spend      numeric,
  last_order date,
  days_since int,
  brands     text,
  updated_at timestamptz default now()
);

create table if not exists public.retention_kpi (
  key        text primary key,
  value      numeric,
  updated_at timestamptz default now()
);

alter table public.retention_cohort    enable row level security;
alter table public.rfm_segments        enable row level security;
alter table public.at_risk_customers   enable row level security;
alter table public.retention_kpi       enable row level security;
