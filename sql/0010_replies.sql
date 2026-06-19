-- ============================================================
--  0010 — ร่าง/ประวัติการตอบกลับคอมเมนต์ (เตรียมเชื่อม Shopee API)
-- ============================================================
create table if not exists public.comment_replies (
  comment_id        text primary key,
  reply_text        text,
  status            text default 'draft',   -- draft | sent | failed
  platform          text default 'shopee',
  platform_response text,
  replied_by        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table public.comment_replies enable row level security;
