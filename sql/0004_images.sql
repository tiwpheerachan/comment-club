-- ============================================================
--  0004 — เก็บ URL รูปที่ลูกค้าแนบในคอมเมนต์ (Shopee CDN)
-- ============================================================
alter table public.comments
  add column if not exists images jsonb default '[]'::jsonb;
