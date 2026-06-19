-- ============================================================
--  0005 — ตารางสินค้า (dimension) จาก shopee_items + อัปเดต product_stats ให้มีชื่อ/รูป
-- ============================================================
create table if not exists public.products (
  item_id            text primary key,
  item_name          text,
  item_sku           text,
  model_sku          text,
  brand              text,
  price              numeric,
  category_id        text,
  thumbnail_url      text,
  image_url          text,
  rating_star        numeric,
  comment_count      int,
  views              int,
  likes              int,
  stock              int,
  updated_at         timestamptz default now()
);

alter table public.products enable row level security;

-- product_stats เดิม group by product_name(=item_id) — เพิ่ม join products เพื่อได้ชื่อ/รูป/ราคา
-- ต้อง drop ก่อนเพราะเปลี่ยนลำดับ/ชื่อคอลัมน์ (create or replace เปลี่ยนไม่ได้)
drop view if exists public.product_stats;
create view public.product_stats as
select
  coalesce(c.product_name, '(ไม่ระบุสินค้า)')                                      as product_name, -- = item_id (key)
  max(p.item_name)                                                                 as item_name,
  max(p.item_sku)                                                                  as item_sku,
  max(p.thumbnail_url)                                                             as thumbnail_url,
  max(p.image_url)                                                                 as image_url,
  max(p.price)                                                                     as price,
  max(coalesce(p.brand, c.brand))                                                  as brand,
  max(p.category_id)                                                               as category_id,
  count(*)                                                                         as total,
  count(*) filter (where c.sentiment = 'positive')                                 as positive,
  count(*) filter (where c.sentiment = 'neutral')                                  as neutral,
  count(*) filter (where c.sentiment = 'negative')                                 as negative,
  round(avg(c.rating)::numeric, 2)                                                 as avg_rating,
  count(*) filter (where c.urgent)                                                 as urgent_count,
  round(
    (count(*) filter (where c.sentiment = 'positive')
     - count(*) filter (where c.sentiment = 'negative'))::numeric
    / nullif(count(*), 0) * 100, 1)                                               as sentiment_score
from public.comments c
left join public.products p on p.item_id = c.product_name
group by 1;
