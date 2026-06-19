// ดึงคอมเมนต์จาก BigQuery แบบ incremental (เฉพาะที่ใหม่กว่า watermark)
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { BigQuery } from "@google-cloud/bigquery";
import { BIGQUERY, COLUMNS, CREATED_AT_EXPR, STD_FIELDS, TEXT_ONLY_WHERE } from "./config";
import type { RawComment } from "./types";

/** auto-detect service-account.json ที่รากโปรเจกต์ ถ้าไม่ได้ตั้ง GOOGLE_APPLICATION_CREDENTIALS */
function keyFile(): string | undefined {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return undefined; // ใช้ env ปกติ
  const local = resolve(process.cwd(), "service-account.json");
  return existsSync(local) ? local : undefined;
}

function client(): BigQuery {
  return new BigQuery({
    projectId: BIGQUERY.projectId,
    location: BIGQUERY.location,
    keyFilename: keyFile(),
  });
}

/** สร้าง SELECT โดย alias เป็นชื่อมาตรฐาน ข้ามคอลัมน์ที่ไม่ได้ตั้งค่า */
function selectExpr(): string {
  const base = STD_FIELDS.map((std) => {
    if (std === "created_at") return `${CREATED_AT_EXPR} AS created_at`;
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
    shop_name: row.shop_name != null ? String(row.shop_name) : null,
    product_name: row.product_name != null ? String(row.product_name) : null,
    product_id: row.product_id != null ? String(row.product_id) : null,
    rating,
    comment_text: row.comment_text != null ? String(row.comment_text) : null,
    username: row.username != null ? String(row.username) : null,
    created_at: toIso(row.created_at),
    order_id: row.order_id != null ? String(row.order_id) : null,
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

/** ทดสอบการเชื่อมต่อ */
export async function healthcheck(): Promise<boolean> {
  await client().query({ query: "SELECT 1 AS ok", location: BIGQUERY.location });
  return true;
}
