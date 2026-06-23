-- ============================================================
--  0016 — คำตอบจากผู้ขายที่ตอบไปแล้วบน Shopee (ดึงจาก reply/reply_ctime/reply_hidden)
-- ============================================================
alter table public.comments add column if not exists seller_reply        text;
alter table public.comments add column if not exists seller_reply_at      timestamptz;
alter table public.comments add column if not exists seller_reply_hidden  boolean;
