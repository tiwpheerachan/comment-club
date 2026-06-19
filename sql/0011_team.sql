-- ============================================================
--  0011 — ทีม/โปรไฟล์ + บันทึกกิจกรรม (ใครทำอะไร)
-- ============================================================
create table if not exists public.team_members (
  name       text primary key,
  role       text,
  updated_at timestamptz default now()
);

create table if not exists public.activity_log (
  id         bigint generated always as identity primary key,
  actor      text,
  action     text,        -- เช่น รับเรื่อง / ปิดงาน / มอบหมาย / ตอบกลับ
  comment_id text,
  detail     text,
  created_at timestamptz default now()
);
create index if not exists idx_activity_created on public.activity_log (created_at desc);

alter table public.team_members enable row level security;
alter table public.activity_log enable row level security;
