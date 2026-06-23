-- ============================================================
--  0015 — เก็บ shop_id ของคอมเมนต์ (สร้างลิงก์ไปหน้าสินค้า Shopee + ตอบกลับ)
-- ============================================================
alter table public.comments add column if not exists shop_id text;
create index if not exists idx_comments_shop on public.comments (shop_id);
