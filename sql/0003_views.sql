-- ============================================================
--  0003 — views สรุปต่อสินค้า / ต่อแบรนด์ / ต่อหมวด (ให้หน้า dashboard เรียกตรง)
--  รันต่อจาก 0002
-- ============================================================

-- drop ก่อน (0005 จะ redefine ด้วยคอลัมน์มากกว่า — กัน "cannot drop columns from view" ตอนรันซ้ำ)
drop view if exists public.product_stats;
create view public.product_stats as
select
  coalesce(product_name, '(ไม่ระบุสินค้า)')                                       as product_name,
  max(brand)                                                                       as brand,
  count(*)                                                                         as total,
  count(*) filter (where sentiment = 'positive')                                   as positive,
  count(*) filter (where sentiment = 'neutral')                                    as neutral,
  count(*) filter (where sentiment = 'negative')                                   as negative,
  round(avg(rating)::numeric, 2)                                                   as avg_rating,
  count(*) filter (where urgent)                                                   as urgent_count,
  round(
    (count(*) filter (where sentiment = 'positive')
     - count(*) filter (where sentiment = 'negative'))::numeric
    / nullif(count(*), 0) * 100, 1)                                               as sentiment_score
from public.comments
group by 1;

create or replace view public.brand_stats as
select
  coalesce(brand, 'ไม่ระบุแบรนด์')                                                 as brand,
  count(*)                                                                         as total,
  count(*) filter (where sentiment = 'positive')                                   as positive,
  count(*) filter (where sentiment = 'neutral')                                    as neutral,
  count(*) filter (where sentiment = 'negative')                                   as negative,
  round(avg(rating)::numeric, 2)                                                   as avg_rating,
  count(*) filter (where urgent)                                                   as urgent_count,
  round(
    (count(*) filter (where sentiment = 'positive')
     - count(*) filter (where sentiment = 'negative'))::numeric
    / nullif(count(*), 0) * 100, 1)                                               as sentiment_score
from public.comments
group by 1;

-- ปัญหาแยกหมวด (เฉพาะคอมเมนต์เชิงลบ) — ใช้ในหน้า trends/issues
create or replace view public.category_stats as
select
  category,
  count(*) as total
from public.comments
where sentiment = 'negative' and category <> 'เชิงบวก/ชม'
group by 1;
