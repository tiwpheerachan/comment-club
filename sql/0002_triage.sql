-- ============================================================
--  0002 — เพิ่มฟิลด์สำหรับ "ศูนย์จัดการด่วน" (triage workflow)
--  รันต่อจาก 0001_init.sql
-- ============================================================

alter table public.comments
  add column if not exists status     text default 'new',     -- new | in_progress | resolved
  add column if not exists assignee   text,
  add column if not exists handled_at timestamptz,
  add column if not exists note       text;

create index if not exists idx_comments_status   on public.comments (status);
create index if not exists idx_comments_product   on public.comments (product_name);
create index if not exists idx_comments_severity  on public.comments (severity desc);

-- ค้นหาข้อความแบบ full-text เบื้องต้น (ภาษาไทยใช้ trigram ได้ผลกว่า)
create extension if not exists pg_trgm;
create index if not exists idx_comments_text_trgm
  on public.comments using gin (comment_text gin_trgm_ops);
