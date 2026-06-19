-- ============================================================
--  0006 — views สำหรับหน้าเทรนด์ (คำนวณ time-series จาก comments จริง)
--  ใช้เวลาไทย (Asia/Bangkok) ในการจัดกลุ่มรายวัน
-- ============================================================

-- เทรนด์รายวันรวม
create or replace view public.daily_trend as
select
  (created_at at time zone 'Asia/Bangkok')::date                                   as date,
  count(*)                                                                         as total,
  count(*) filter (where sentiment = 'positive')                                   as positive,
  count(*) filter (where sentiment = 'neutral')                                    as neutral,
  count(*) filter (where sentiment = 'negative')                                   as negative,
  count(*) filter (where urgent)                                                   as urgent,
  round(avg(rating)::numeric, 2)                                                   as avg_rating,
  round(
    (count(*) filter (where sentiment = 'positive')
     - count(*) filter (where sentiment = 'negative'))::numeric
    / nullif(count(*), 0) * 100, 1)                                               as score
from public.comments
where created_at is not null
group by 1;

-- เทรนด์รายวันแยกแบรนด์
create or replace view public.daily_brand_trend as
select
  (created_at at time zone 'Asia/Bangkok')::date                                   as date,
  coalesce(brand, 'ไม่ระบุแบรนด์')                                                  as brand,
  count(*)                                                                         as total,
  count(*) filter (where urgent)                                                   as urgent,
  round(
    (count(*) filter (where sentiment = 'positive')
     - count(*) filter (where sentiment = 'negative'))::numeric
    / nullif(count(*), 0) * 100, 1)                                               as score
from public.comments
where created_at is not null
group by 1, 2;

-- เทรนด์ปัญหา (หมวดเชิงลบ) รายวัน
create or replace view public.category_daily as
select
  (created_at at time zone 'Asia/Bangkok')::date                                   as date,
  category,
  count(*)                                                                         as total
from public.comments
where sentiment = 'negative' and category <> 'เชิงบวก/ชม' and created_at is not null
group by 1, 2;
