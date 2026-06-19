-- ============================================================
--  Shopee Comment AI — Supabase schema
--  รันไฟล์นี้ใน Supabase: Dashboard > SQL Editor > New query > วาง > Run
--  (หรือผ่าน CLI: supabase db execute --file sql/0001_init.sql)
-- ============================================================

-- ------------------------------------------------------------
--  comments : คอมเมนต์ดิบจาก BigQuery + ผลวิเคราะห์ (พักไว้กัน query ซ้ำ)
-- ------------------------------------------------------------
create table if not exists public.comments (
  comment_id       text primary key,
  brand            text,
  shop_name        text,
  product_name     text,
  product_id       text,
  rating           numeric,
  comment_text     text,
  username         text,
  created_at       timestamptz,            -- เวลาที่ลูกค้าคอมเมนต์ (จาก BigQuery)
  order_id         text,
  -- ผลวิเคราะห์
  sentiment        text,                   -- positive | neutral | negative
  category         text,
  severity         int  default 0,         -- 0-10
  summary          text,
  suggested_action text,
  urgent           boolean default false,
  analyzed_by      text,                   -- ai | rule
  model            text,
  fetched_at       timestamptz default now(),
  analyzed_at      timestamptz default now()
);

create index if not exists idx_comments_created_at on public.comments (created_at desc);
create index if not exists idx_comments_brand       on public.comments (brand);
create index if not exists idx_comments_urgent      on public.comments (urgent) where urgent = true;
create index if not exists idx_comments_sentiment   on public.comments (sentiment);

-- ------------------------------------------------------------
--  snapshots : ผลสรุป (summary) ล่าสุดทั้งก้อน — dashboard อ่านแถวล่าสุด
-- ------------------------------------------------------------
create table if not exists public.snapshots (
  id          bigint generated always as identity primary key,
  data        jsonb not null,             -- โครงเดียวกับ type Summary
  window_days int,
  created_at  timestamptz default now()
);

create index if not exists idx_snapshots_created_at on public.snapshots (created_at desc);

-- ------------------------------------------------------------
--  daily_metrics : คะแนนรายวันไว้ดูเทรนด์ (1 แถว/วัน)
-- ------------------------------------------------------------
create table if not exists public.daily_metrics (
  date          date primary key,
  overall_score numeric,
  total         int,
  urgent        int,
  brands        jsonb,                     -- { "BrandA": 12.3, "BrandB": -4.5 }
  updated_at    timestamptz default now()
);

-- ------------------------------------------------------------
--  pipeline_runs : log การรันแต่ละรอบ + watermark
-- ------------------------------------------------------------
create table if not exists public.pipeline_runs (
  id          bigint generated always as identity primary key,
  started_at  timestamptz default now(),
  finished_at timestamptz,
  status      text,                        -- success | error
  fetched     int default 0,
  analyzed    int default 0,
  watermark   timestamptz,                 -- created_at ล่าสุดที่ดึงมาได้รอบนี้
  message     text
);

-- ------------------------------------------------------------
--  RLS : เปิดไว้และไม่เปิด policy สาธารณะ
--  แอป (pipeline + dashboard) เรียกฝั่ง server ด้วย service-role key ซึ่งข้าม RLS อยู่แล้ว
--  ถ้าต้องการให้ฝั่ง client (anon) อ่าน snapshots/daily_metrics ได้ ค่อยเพิ่ม policy ทีหลัง
-- ------------------------------------------------------------
alter table public.comments      enable row level security;
alter table public.snapshots     enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.pipeline_runs enable row level security;
