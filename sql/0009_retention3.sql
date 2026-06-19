-- ============================================================
--  0009 — Retention เชิงลึก: gap histogram, brand mix, review×retention
-- ============================================================
create table if not exists public.retention_gap (
  bucket text primary key,   -- ช่วงวันก่อนกลับมาซื้อ
  n      int
);

create table if not exists public.retention_brandmix (
  bucket    text primary key, -- จำนวนแบรนด์ที่ซื้อ
  customers int
);

create table if not exists public.retention_review (
  grp         text primary key, -- กลุ่มตามรีวิว
  customers   int,
  repeat_rate numeric
);

alter table public.retention_gap      enable row level security;
alter table public.retention_brandmix enable row level security;
alter table public.retention_review   enable row level security;
