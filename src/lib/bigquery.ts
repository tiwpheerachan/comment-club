// ดึงคอมเมนต์จาก BigQuery แบบ incremental (เฉพาะที่ใหม่กว่า watermark)
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { BigQuery } from "@google-cloud/bigquery";
import { BIGQUERY, COLUMNS, CREATED_AT_EXPR, SELLER_REPLY_AT_EXPR, STD_FIELDS, TEXT_ONLY_WHERE } from "./config";
import type { RawComment } from "./types";

/** auto-detect service-account.json ที่รากโปรเจกต์
 *  - ถ้า GOOGLE_APPLICATION_CREDENTIALS ตั้งไว้และไฟล์ "มีจริง" → ใช้ env ปกติ
 *  - ถ้าตั้งไว้แต่ไฟล์ไม่มี (เช่น path /etc/secrets บน Render ที่ยังไม่อัปโหลด) → fallback ไฟล์ที่รากโปรเจกต์ */
function keyFile(): string | undefined {
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gac && existsSync(gac)) return undefined; // ใช้ env ปกติ (ไฟล์มีจริง)
  const local = resolve(process.cwd(), "service-account.json");
  return existsSync(local) ? local : undefined;
}

/** อ่าน credentials จาก env var (JSON ตรง ๆ หรือ base64) — สะดวกบน host ที่แนบไฟล์ไม่ได้ */
function inlineCredentials(): Record<string, unknown> | undefined {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return undefined;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (e) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON อ่านไม่ได้ (ต้องเป็น JSON หรือ base64 ของ JSON): ${e instanceof Error ? e.message : e}`);
  }
}

function client(): BigQuery {
  const opts: ConstructorParameters<typeof BigQuery>[0] = {
    projectId: BIGQUERY.projectId,
    location: BIGQUERY.location,
  };
  const cred = inlineCredentials();
  if (cred) opts.credentials = cred;            // ลำดับแรก: env var
  else opts.keyFilename = keyFile();            // ไม่งั้น: ไฟล์ (รากโปรเจกต์ / GAC)
  return new BigQuery(opts);
}

/** สร้าง SELECT โดย alias เป็นชื่อมาตรฐาน ข้ามคอลัมน์ที่ไม่ได้ตั้งค่า */
function selectExpr(): string {
  const base = STD_FIELDS.map((std) => {
    if (std === "created_at") return `${CREATED_AT_EXPR} AS created_at`;
    if (std === "seller_reply_at") return `${SELLER_REPLY_AT_EXPR} AS seller_reply_at`;
    if (std === "seller_reply_hidden") return `\`reply_hidden\` AS seller_reply_hidden`;
    const real = COLUMNS[std];
    return real ? `\`${real}\` AS ${std}` : `NULL AS ${std}`;
  });
  // images เป็น ARRAY<STRING> — ดึงตรง ๆ ไม่ต้อง alias พิเศษ
  base.push("images AS images");
  return base.join(",\n  ");
}

function fqTable(): string {
  return `\`${BIGQUERY.projectId}.${BIGQUERY.dataset}.${BIGQUERY.table}\``;
}

function toIso(v: unknown): string | null {
  if (v == null) return null;
  // BigQuery client คืน timestamp เป็น object { value: "..." } หรือ Date
  if (typeof v === "object" && v !== null && "value" in v) {
    return String((v as { value: unknown }).value);
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function normalizeRow(row: Record<string, unknown>): RawComment {
  const ratingRaw = row.rating;
  let rating: number | null = null;
  if (ratingRaw != null && ratingRaw !== "") {
    const n = Number(ratingRaw);
    rating = Number.isFinite(n) ? n : null;
  }
  return {
    comment_id: String(row.comment_id ?? ""),
    brand: row.brand != null ? String(row.brand) : null,
    shop_id: row.shop_id != null ? String(row.shop_id) : null,
    shop_name: row.shop_name != null ? String(row.shop_name) : null,
    product_name: row.product_name != null ? String(row.product_name) : null,
    product_id: row.product_id != null ? String(row.product_id) : null,
    rating,
    comment_text: row.comment_text != null ? String(row.comment_text) : null,
    username: row.username != null ? String(row.username) : null,
    created_at: toIso(row.created_at),
    order_id: row.order_id != null ? String(row.order_id) : null,
    seller_reply: row.seller_reply != null && String(row.seller_reply) !== "" ? String(row.seller_reply) : null,
    seller_reply_at: toIso(row.seller_reply_at),
    seller_reply_hidden: row.seller_reply_hidden == null ? null : Boolean(row.seller_reply_hidden),
    images: Array.isArray(row.images) ? (row.images as unknown[]).map(String).filter(Boolean) : [],
  };
}

export interface FetchOpts {
  /** ISO timestamp — ดึงเฉพาะคอมเมนต์ที่ใหม่กว่านี้ (ไม่ระบุ = backfill ตาม sinceDays) */
  sinceTimestamp?: string | null;
  /** ถ้าไม่มี watermark ให้ดึงย้อนหลังกี่วัน */
  backfillDays?: number;
  limit?: number;
}

/**
 * ดึงคอมเมนต์ใหม่จาก BigQuery
 * - ถ้ามี sinceTimestamp: WHERE created_at > sinceTimestamp
 * - ถ้าไม่มี: WHERE created_at >= now - backfillDays
 */
export async function fetchNewComments(opts: FetchOpts = {}): Promise<RawComment[]> {
  const params: Record<string, unknown> = {};
  let timeClause: string;

  if (opts.sinceTimestamp) {
    timeClause = `${CREATED_AT_EXPR} > TIMESTAMP(@since)`;
    params.since = opts.sinceTimestamp;
  } else {
    timeClause = `${CREATED_AT_EXPR} >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)`;
    params.days = opts.backfillDays ?? 30;
  }

  // ดึงเฉพาะคอมเมนต์ที่มีข้อความจริง (ข้ามดาวล้วน) เพื่อประหยัดค่า AI
  const whereClause = `(${TEXT_ONLY_WHERE}) AND ${timeClause}`;
  const limitClause = opts.limit && opts.limit > 0 ? `LIMIT ${Math.floor(opts.limit)}` : "";

  const query = `
    SELECT
      ${selectExpr()}
    FROM ${fqTable()}
    WHERE ${whereClause}
    ORDER BY ${CREATED_AT_EXPR} ASC
    ${limitClause}
  `;

  const [rows] = await client().query({
    query,
    params,
    location: BIGQUERY.location,
  });

  return (rows as Record<string, unknown>[]).map(normalizeRow).filter((r) => r.comment_id);
}

export interface ProductMeta {
  item_id: string;
  item_name: string | null;
  item_sku: string | null;
  model_sku: string | null;
  brand: string | null;
  price: number | null;
  category_id: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  rating_star: number | null;
  comment_count: number | null;
  views: number | null;
  likes: number | null;
  stock: number | null;
}

/** ดึง metadata สินค้าจาก shopee_items (เอา snapshot ล่าสุดต่อ item_id) สำหรับ item_id ที่ระบุ */
export async function fetchProducts(itemIds: string[]): Promise<ProductMeta[]> {
  if (itemIds.length === 0) return [];
  const ids = itemIds.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return [];
  const itemsTable = `\`${BIGQUERY.projectId}.${BIGQUERY.dataset}.shopee_items\``;

  const query = `
    WITH ranked AS (
      SELECT
        item_id, item_name, item_sku, model_sku, product_brand_name AS brand, price,
        category_id, thumbnail_url, image_url, rating_star, comment_count, views, likes,
        total_available_stock AS stock,
        ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY partition_date DESC, update_time DESC) rn
      FROM ${itemsTable}
      WHERE item_id IN UNNEST(@ids)
    )
    SELECT * EXCEPT(rn) FROM ranked WHERE rn = 1
  `;
  const [rows] = await client().query({
    query,
    params: { ids },
    types: { ids: ["INT64"] },
    location: BIGQUERY.location,
  });

  return (rows as Record<string, unknown>[]).map((r) => ({
    item_id: String(r.item_id),
    item_name: r.item_name != null ? String(r.item_name) : null,
    item_sku: r.item_sku ? String(r.item_sku) : null,
    model_sku: r.model_sku ? String(r.model_sku) : null,
    brand: r.brand != null ? String(r.brand) : null,
    price: r.price != null ? Number(r.price) : null,
    category_id: r.category_id != null ? String(r.category_id) : null,
    thumbnail_url: r.thumbnail_url != null ? String(r.thumbnail_url) : null,
    image_url: r.image_url != null ? String(r.image_url) : null,
    rating_star: r.rating_star != null ? Number(r.rating_star) : null,
    comment_count: r.comment_count != null ? Number(r.comment_count) : null,
    views: r.views != null ? Number(r.views) : null,
    likes: r.likes != null ? Number(r.likes) : null,
    stock: r.stock != null ? Number(r.stock) : null,
  }));
}

// ---------- Customer Retention (จาก shopee_orders / shopee_order_items) ----------

export interface RetentionData {
  summary: { scope: string; customers: number; repeat_customers: number; one_time: number; total_orders: number; repeat_rate: number; avg_orders: number }[];
  monthly: { month: string; new_customers: number; returning_customers: number; orders: number }[];
  distribution: { bucket: string; customers: number }[];
  topCustomers: { buyer: string; orders: number; spend: number; first_order: string; last_order: string; brands: string }[];
  cohort: { cohort: string; months_since: number; customers: number }[];
  rfm: { segment: string; customers: number; avg_recency: number; avg_frequency: number; avg_monetary: number; total_spend: number }[];
  atRisk: { buyer: string; orders: number; spend: number; last_order: string; days_since: number; brands: string }[];
  gap: { bucket: string; n: number }[];
  brandmix: { bucket: string; customers: number }[];
  review: { grp: string; customers: number; repeat_rate: number }[];
  kpi: Record<string, number>;
}

const RFM_CASE = `CASE
  WHEN freq>=3 AND recency<=90 THEN 'แชมเปี้ยน'
  WHEN freq>=2 AND recency<=180 THEN 'ลูกค้าประจำ'
  WHEN freq=1 AND recency<=90 THEN 'ลูกค้าใหม่'
  WHEN freq=1 AND recency<=180 THEN 'มีแวว'
  WHEN freq>=3 AND recency>365 THEN 'ห้ามเสีย (เคย VIP)'
  WHEN freq>=2 AND recency<=365 THEN 'กำลังจะหลุด'
  WHEN recency<=365 THEN 'หลับใหล'
  ELSE 'หลุดไปแล้ว'
END`;

export async function fetchRetention(): Promise<RetentionData> {
  const ORDERS = `\`${BIGQUERY.projectId}.${BIGQUERY.dataset}.shopee_orders\``;
  const ITEMS = `\`${BIGQUERY.projectId}.${BIGQUERY.dataset}.shopee_order_items\``;
  const DONE = `order_status = 'COMPLETED' AND buyer_username IS NOT NULL AND buyer_username != ''`;
  const c = client();
  const run = async (query: string) => {
    const [rows] = await c.query({ query, location: BIGQUERY.location });
    return rows as Record<string, unknown>[];
  };
  const num = (v: unknown) => (v == null ? 0 : Number(v));

  const TODAY = `(SELECT MAX(create_date) FROM ${ORDERS} WHERE ${DONE})`;
  const COMMENTS = `\`${BIGQUERY.projectId}.${BIGQUERY.dataset}.shopee_product_comments\``;

  const [summaryRows, monthlyRows, distRows, topRows, cohortRows, rfmRows, atRiskRows, kpiRows, gapRows, brandmixRows, reviewRows, paretoRows] = await Promise.all([
    run(`
      WITH ob AS (SELECT brand_id, buyer_username b, COUNT(*) o FROM ${ORDERS} WHERE ${DONE} GROUP BY 1,2),
           oall AS (SELECT buyer_username b, COUNT(*) o FROM ${ORDERS} WHERE ${DONE} GROUP BY 1)
      SELECT brand_id scope, COUNT(*) customers, COUNTIF(o>=2) repeat_customers, COUNTIF(o=1) one_time,
             SUM(o) total_orders, ROUND(COUNTIF(o>=2)/COUNT(*)*100,1) repeat_rate, ROUND(AVG(o),2) avg_orders
      FROM ob WHERE brand_id IS NOT NULL GROUP BY 1
      UNION ALL
      SELECT 'ALL', COUNT(*), COUNTIF(o>=2), COUNTIF(o=1), SUM(o),
             ROUND(COUNTIF(o>=2)/COUNT(*)*100,1), ROUND(AVG(o),2) FROM oall`),
    run(`
      WITH ord AS (SELECT buyer_username b, create_date d FROM ${ORDERS} WHERE ${DONE}),
           firsts AS (SELECT b, MIN(d) fd FROM ord GROUP BY 1),
           m AS (SELECT DATE_TRUNC(o.d, MONTH) month, o.b, DATE_TRUNC(f.fd, MONTH)=DATE_TRUNC(o.d, MONTH) is_new
                 FROM ord o JOIN firsts f USING(b))
      SELECT CAST(month AS STRING) month,
             COUNT(DISTINCT IF(is_new, b, NULL)) new_customers,
             COUNT(DISTINCT IF(NOT is_new, b, NULL)) returning_customers,
             COUNT(*) orders
      FROM m GROUP BY 1 ORDER BY 1`),
    run(`
      WITH b AS (SELECT buyer_username, COUNT(*) o FROM ${ORDERS} WHERE ${DONE} GROUP BY 1)
      SELECT CASE WHEN o>=5 THEN '5+' ELSE CAST(o AS STRING) END bucket, COUNT(*) customers
      FROM b GROUP BY 1 ORDER BY 1`),
    run(`
      WITH s AS (
        SELECT o.buyer_username b, COUNT(DISTINCT o.order_sn) orders, SUM(oi.price*oi.quantity) spend,
               CAST(MIN(o.create_date) AS STRING) first_order, CAST(MAX(o.create_date) AS STRING) last_order,
               STRING_AGG(DISTINCT o.brand_id, ', ') brands
        FROM ${ORDERS} o JOIN ${ITEMS} oi USING(order_sn)
        WHERE o.order_status='COMPLETED' AND o.buyer_username IS NOT NULL AND o.buyer_username!=''
        GROUP BY 1)
      SELECT * FROM s ORDER BY orders DESC, spend DESC LIMIT 100`),
    // cohort retention
    run(`
      WITH ord AS (SELECT buyer_username b, create_date d FROM ${ORDERS} WHERE ${DONE}),
           firsts AS (SELECT b, DATE_TRUNC(MIN(d), MONTH) cohort FROM ord GROUP BY 1),
           act AS (SELECT f.cohort, DATE_DIFF(DATE_TRUNC(o.d, MONTH), f.cohort, MONTH) mi, o.b
                   FROM ord o JOIN firsts f USING(b))
      SELECT CAST(cohort AS STRING) cohort, mi months_since, COUNT(DISTINCT b) customers
      FROM act
      WHERE cohort >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 17 MONTH), MONTH) AND mi BETWEEN 0 AND 12
      GROUP BY 1,2 ORDER BY 1,2`),
    // RFM segments
    run(`
      WITH buyer AS (
        SELECT o.buyer_username b, COUNT(DISTINCT o.order_sn) freq,
               DATE_DIFF(${TODAY}, MAX(o.create_date), DAY) recency,
               SUM(oi.price*oi.quantity) monetary
        FROM ${ORDERS} o JOIN ${ITEMS} oi USING(order_sn)
        WHERE o.order_status='COMPLETED' AND o.buyer_username IS NOT NULL AND o.buyer_username!='' GROUP BY 1),
      seg AS (SELECT *, ${RFM_CASE} segment FROM buyer)
      SELECT segment, COUNT(*) customers, ROUND(AVG(recency)) avg_recency, ROUND(AVG(freq),2) avg_frequency,
             ROUND(AVG(monetary)) avg_monetary, ROUND(SUM(monetary)) total_spend
      FROM seg GROUP BY 1`),
    // win-back / at-risk (repeat customers gone quiet)
    run(`
      SELECT o.buyer_username b, COUNT(DISTINCT o.order_sn) orders, ROUND(SUM(oi.price*oi.quantity)) spend,
             CAST(MAX(o.create_date) AS STRING) last_order,
             DATE_DIFF(${TODAY}, MAX(o.create_date), DAY) days_since,
             STRING_AGG(DISTINCT o.brand_id, ', ') brands
      FROM ${ORDERS} o JOIN ${ITEMS} oi USING(order_sn)
      WHERE o.order_status='COMPLETED' AND o.buyer_username IS NOT NULL AND o.buyer_username!=''
      GROUP BY 1
      HAVING orders>=2 AND days_since BETWEEN 120 AND 540
      ORDER BY spend DESC LIMIT 100`),
    // kpi: time-to-2nd-order + returning revenue %
    run(`
      WITH ord AS (SELECT buyer_username b, create_date d FROM ${ORDERS} WHERE ${DONE}),
           ranked AS (SELECT b, d, ROW_NUMBER() OVER (PARTITION BY b ORDER BY d) rn FROM ord),
           second AS (SELECT a.b, DATE_DIFF(s.d, a.d, DAY) gap FROM ranked a JOIN ranked s ON a.b=s.b AND a.rn=1 AND s.rn=2),
           buyer AS (SELECT o.buyer_username b, COUNT(DISTINCT o.order_sn) freq, SUM(oi.price*oi.quantity) spend
                     FROM ${ORDERS} o JOIN ${ITEMS} oi USING(order_sn)
                     WHERE o.order_status='COMPLETED' AND o.buyer_username IS NOT NULL AND o.buyer_username!='' GROUP BY 1)
      SELECT
        (SELECT APPROX_QUANTILES(gap,100)[OFFSET(50)] FROM second) median_days_to_2nd,
        (SELECT ROUND(AVG(gap)) FROM second) avg_days_to_2nd,
        (SELECT COUNT(*) FROM second) repeat2,
        (SELECT ROUND(SUM(IF(freq>=2,spend,0))/NULLIF(SUM(spend),0)*100,1) FROM buyer) returning_rev_pct,
        (SELECT ROUND(SUM(spend)) FROM buyer) total_revenue`),
    // gap histogram: ลูกค้ากลับมาซื้อภายในกี่วัน
    run(`
      WITH ord AS (SELECT buyer_username b, create_date d FROM ${ORDERS} WHERE ${DONE}),
           ranked AS (SELECT b, d, ROW_NUMBER() OVER (PARTITION BY b ORDER BY d) rn FROM ord),
           gaps AS (SELECT DATE_DIFF(s.d, a.d, DAY) g FROM ranked a JOIN ranked s ON a.b=s.b AND s.rn=a.rn+1)
      SELECT CASE WHEN g<=30 THEN '0-30' WHEN g<=60 THEN '31-60' WHEN g<=90 THEN '61-90'
                  WHEN g<=180 THEN '91-180' WHEN g<=365 THEN '181-365' ELSE '365+' END bucket, COUNT(*) n
      FROM gaps GROUP BY 1`),
    // brand stickiness: ลูกค้าซื้อกี่แบรนด์
    run(`
      WITH b AS (SELECT buyer_username, COUNT(DISTINCT brand_id) nb FROM ${ORDERS} WHERE ${DONE} AND brand_id IS NOT NULL GROUP BY 1)
      SELECT CASE WHEN nb<=1 THEN '1 แบรนด์' WHEN nb=2 THEN '2 แบรนด์' ELSE '3+ แบรนด์' END bucket, COUNT(*) customers
      FROM b GROUP BY 1`),
    // review × retention: ลูกค้าที่เคยรีวิวแย่ ซื้อซ้ำน้อยกว่าไหม
    run(`
      WITH ord AS (SELECT buyer_username b, COUNT(DISTINCT order_sn) freq FROM ${ORDERS} WHERE ${DONE} GROUP BY 1),
           cm AS (SELECT buyer_username b, MIN(rating_star) worst FROM ${COMMENTS}
                  WHERE comment IS NOT NULL AND comment!='' AND buyer_username IS NOT NULL AND buyer_username!='' GROUP BY 1)
      SELECT CASE WHEN cm.b IS NULL THEN 'ไม่เคยรีวิว'
                  WHEN cm.worst<=2 THEN 'เคยรีวิวแย่ (≤2★)'
                  WHEN cm.worst=3 THEN 'รีวิวกลาง (3★)' ELSE 'รีวิวดี (≥4★)' END grp,
             COUNT(*) customers, ROUND(COUNTIF(ord.freq>=2)/COUNT(*)*100,1) repeat_rate
      FROM ord LEFT JOIN cm USING(b) GROUP BY 1`),
    // revenue Pareto concentration
    run(`
      WITH buyer AS (SELECT o.buyer_username b, SUM(oi.price*oi.quantity) spend
                     FROM ${ORDERS} o JOIN ${ITEMS} oi USING(order_sn)
                     WHERE o.order_status='COMPLETED' AND o.buyer_username IS NOT NULL AND o.buyer_username!='' GROUP BY 1),
           ranked AS (SELECT spend, PERCENT_RANK() OVER (ORDER BY spend DESC) pr FROM buyer),
           tot AS (SELECT SUM(spend) t FROM buyer)
      SELECT ROUND(SUM(IF(pr<0.01,spend,0))/(SELECT t FROM tot)*100,1) top1,
             ROUND(SUM(IF(pr<0.05,spend,0))/(SELECT t FROM tot)*100,1) top5,
             ROUND(SUM(IF(pr<0.10,spend,0))/(SELECT t FROM tot)*100,1) top10,
             ROUND(SUM(IF(pr<0.20,spend,0))/(SELECT t FROM tot)*100,1) top20 FROM ranked`),
  ]);

  return {
    summary: summaryRows.map((r) => ({
      scope: String(r.scope), customers: num(r.customers), repeat_customers: num(r.repeat_customers),
      one_time: num(r.one_time), total_orders: num(r.total_orders), repeat_rate: num(r.repeat_rate), avg_orders: num(r.avg_orders),
    })),
    monthly: monthlyRows.map((r) => ({
      month: String(r.month), new_customers: num(r.new_customers), returning_customers: num(r.returning_customers), orders: num(r.orders),
    })),
    distribution: distRows.map((r) => ({ bucket: String(r.bucket), customers: num(r.customers) })),
    topCustomers: topRows.map((r) => ({
      buyer: String(r.b), orders: num(r.orders), spend: Math.round(num(r.spend)),
      first_order: r.first_order ? String(r.first_order) : "", last_order: r.last_order ? String(r.last_order) : "",
      brands: r.brands ? String(r.brands) : "",
    })),
    cohort: cohortRows.map((r) => ({ cohort: String(r.cohort), months_since: num(r.months_since), customers: num(r.customers) })),
    rfm: rfmRows.map((r) => ({
      segment: String(r.segment), customers: num(r.customers), avg_recency: num(r.avg_recency),
      avg_frequency: num(r.avg_frequency), avg_monetary: num(r.avg_monetary), total_spend: num(r.total_spend),
    })),
    atRisk: atRiskRows.map((r) => ({
      buyer: String(r.b), orders: num(r.orders), spend: Math.round(num(r.spend)),
      last_order: r.last_order ? String(r.last_order) : "", days_since: num(r.days_since), brands: r.brands ? String(r.brands) : "",
    })),
    gap: gapRows.map((r) => ({ bucket: String(r.bucket), n: num(r.n) })),
    brandmix: brandmixRows.map((r) => ({ bucket: String(r.bucket), customers: num(r.customers) })),
    review: reviewRows.map((r) => ({ grp: String(r.grp), customers: num(r.customers), repeat_rate: num(r.repeat_rate) })),
    kpi: {
      median_days_to_2nd: num(kpiRows[0]?.median_days_to_2nd), avg_days_to_2nd: num(kpiRows[0]?.avg_days_to_2nd),
      repeat2: num(kpiRows[0]?.repeat2), returning_rev_pct: num(kpiRows[0]?.returning_rev_pct), total_revenue: num(kpiRows[0]?.total_revenue),
      pareto_top1: num(paretoRows[0]?.top1), pareto_top5: num(paretoRows[0]?.top5), pareto_top10: num(paretoRows[0]?.top10), pareto_top20: num(paretoRows[0]?.top20),
    },
  };
}

/** หา shop_id จาก comment_id (สำหรับตอบกลับ Shopee) */
export async function fetchShopIds(commentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = commentIds.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return out;
  const fq = fqTable();
  const [rows] = await client().query({
    query: `SELECT comment_id, shop_id FROM ${fq} WHERE comment_id IN UNNEST(@ids)`,
    params: { ids },
    types: { ids: ["INT64"] },
    location: BIGQUERY.location,
  });
  for (const r of rows as Record<string, unknown>[]) {
    if (r.comment_id != null && r.shop_id != null) out.set(String(r.comment_id), Number(r.shop_id));
  }
  return out;
}

export interface SellerReplyRow { reply: string; at: string | null; hidden: boolean }
/** ดึง comment_id → คำตอบผู้ขาย (เฉพาะรายที่มี reply จริง) สำหรับ backfill */
export async function fetchAllSellerReplies(): Promise<Map<string, SellerReplyRow>> {
  const out = new Map<string, SellerReplyRow>();
  const [rows] = await client().query({
    query: `SELECT comment_id, reply, ${SELLER_REPLY_AT_EXPR} AS reply_at, reply_hidden AS hidden
            FROM ${fqTable()}
            WHERE reply IS NOT NULL AND reply != ''`,
    location: BIGQUERY.location,
  });
  for (const r of rows as Record<string, unknown>[]) {
    if (r.comment_id == null) continue;
    out.set(String(r.comment_id), { reply: String(r.reply), at: toIso(r.reply_at), hidden: Boolean(r.hidden) });
  }
  return out;
}

/** ดึง comment_id → shop_id ทั้งหมด (เฉพาะคอมเมนต์ที่มีข้อความ) สำหรับ backfill */
export async function fetchAllShopIds(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const [rows] = await client().query({
    query: `SELECT comment_id, shop_id FROM ${fqTable()} WHERE (${TEXT_ONLY_WHERE}) AND shop_id IS NOT NULL`,
    location: BIGQUERY.location,
  });
  for (const r of rows as Record<string, unknown>[]) {
    if (r.comment_id != null && r.shop_id != null) out.set(String(r.comment_id), Number(r.shop_id));
  }
  return out;
}

// ---------- ยอดขายรายวัน (Forecasting) ----------
export interface GmvRow { scope: string; date: string; gmv: number; units: number; net_sales: number | null }

export async function fetchGmvDaily(): Promise<GmvRow[]> {
  const G = `\`${BIGQUERY.projectId}.Canonical.product_gmv_daily\``;
  const O = `\`${BIGQUERY.projectId}.Canonical.order_financials\``;
  const c = client();
  const run = async (q: string) => (await c.query({ query: q, location: BIGQUERY.location }))[0] as Record<string, unknown>[];
  const num = (v: unknown) => (v == null ? 0 : Number(v));

  const [allR, platR, brandR, netR] = await Promise.all([
    run(`SELECT CAST(report_date AS STRING) d, SUM(gmv) gmv, SUM(units_sold) units FROM ${G} GROUP BY 1`),
    run(`SELECT CAST(report_date AS STRING) d, platform, SUM(gmv) gmv, SUM(units_sold) units FROM ${G} WHERE platform IS NOT NULL GROUP BY 1,2`),
    run(`SELECT CAST(report_date AS STRING) d, brand_id, SUM(gmv) gmv, SUM(units_sold) units FROM ${G} WHERE brand_id IS NOT NULL GROUP BY 1,2`),
    run(`SELECT CAST(order_date AS STRING) d, SUM(net_sales) net FROM ${O} WHERE order_date IS NOT NULL GROUP BY 1`),
  ]);
  const netMap = new Map(netR.map((r) => [String(r.d), num(r.net)]));
  const rows: GmvRow[] = [];
  for (const r of allR) rows.push({ scope: "ALL", date: String(r.d), gmv: num(r.gmv), units: num(r.units), net_sales: netMap.get(String(r.d)) ?? null });
  for (const r of platR) rows.push({ scope: "platform:" + r.platform, date: String(r.d), gmv: num(r.gmv), units: num(r.units), net_sales: null });
  for (const r of brandR) rows.push({ scope: "brand:" + r.brand_id, date: String(r.d), gmv: num(r.gmv), units: num(r.units), net_sales: null });
  return rows;
}

// ---------- พยากรณ์สินค้า & สต๊อก ----------
export interface DemandRow { product_id: string; product_name: string | null; brand: string | null; platform: string | null; date: string; units: number; gmv: number }
export interface StockRow { product_id: string; platform: string; stock: number; reserved: number; name: string | null; brand: string | null }

/** ยอดขายรายวันของสินค้าที่ยังเคลื่อนไหว (ขายได้ใน 90 วันล่าสุด) — เก็บเฉพาะวันที่มียอด */
export async function fetchActiveProductDemand(historyDays = 540): Promise<DemandRow[]> {
  const G = `\`${BIGQUERY.projectId}.Canonical.product_gmv_daily\``;
  const [rows] = await client().query({
    query: `
      WITH active AS (
        SELECT product_id FROM ${G}
        WHERE report_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY) AND units_sold > 0 AND product_id IS NOT NULL
        GROUP BY product_id
      )
      SELECT CAST(g.product_id AS STRING) product_id,
             ANY_VALUE(g.product_name) product_name,
             ANY_VALUE(g.brand_name) brand,
             ANY_VALUE(g.platform) platform,
             CAST(g.report_date AS STRING) date,
             SUM(g.units_sold) units, SUM(g.gmv) gmv
      FROM ${G} g JOIN active a ON g.product_id = a.product_id
      WHERE g.report_date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY) AND g.units_sold > 0
      GROUP BY g.product_id, g.report_date`,
    params: { days: historyDays }, types: { days: "INT64" }, location: BIGQUERY.location,
  });
  return (rows as Record<string, unknown>[]).map((r) => ({
    product_id: String(r.product_id), product_name: r.product_name != null ? String(r.product_name) : null,
    brand: r.brand != null ? String(r.brand) : null, platform: r.platform != null ? String(r.platform) : null,
    date: String(r.date), units: Number(r.units) || 0, gmv: Number(r.gmv) || 0,
  }));
}

/** สต๊อกคงเหลือล่าสุดต่อสินค้า (Shopee จาก catalog snapshot ล่าสุด + TikTok จาก skus) */
export async function fetchProductStock(): Promise<StockRow[]> {
  const C = `\`${BIGQUERY.projectId}.Canonical.shopee_product_catalog\``;
  const T = `\`${BIGQUERY.projectId}.Platform.tiktok_product_skus\``;
  const [rows] = await client().query({
    query: `
      SELECT CAST(item_id AS STRING) product_id, 'shopee' platform,
             SUM(model_stock) stock, SUM(model_reserved_stock) reserved,
             ANY_VALUE(item_name) name, ANY_VALUE(product_brand_name) brand
      FROM ${C} WHERE partition_date = (SELECT MAX(partition_date) FROM ${C}) AND item_id IS NOT NULL
      GROUP BY item_id
      UNION ALL
      SELECT CAST(product_id AS STRING) product_id, 'tiktok_shop' platform,
             SUM(inventory_total_quantity) stock, 0 reserved,
             CAST(NULL AS STRING) name, CAST(NULL AS STRING) brand
      FROM ${T} WHERE fetched_date = (SELECT MAX(fetched_date) FROM ${T}) AND product_id IS NOT NULL
      GROUP BY product_id`,
    location: BIGQUERY.location,
  });
  return (rows as Record<string, unknown>[]).map((r) => ({
    product_id: String(r.product_id), platform: String(r.platform),
    stock: Number(r.stock) || 0, reserved: Number(r.reserved) || 0,
    name: r.name != null ? String(r.name) : null, brand: r.brand != null ? String(r.brand) : null,
  }));
}

/** ทดสอบการเชื่อมต่อ */
export async function healthcheck(): Promise<boolean> {
  await client().query({ query: "SELECT 1 AS ok", location: BIGQUERY.location });
  return true;
}
