// ตัวช่วย query Supabase สำหรับหน้า Products / Explore / Triage / Trends / Settings
import { getServiceClient } from "./supabase";

export interface ProductStat {
  product_name: string; // = item_id (key)
  item_name: string | null;
  item_sku: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  price: number | null;
  category_id: string | null;
  brand: string | null;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  avg_rating: number | null;
  urgent_count: number;
  sentiment_score: number;
}

export interface BrandStat {
  brand: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  avg_rating: number | null;
  urgent_count: number;
  sentiment_score: number;
}

export interface CommentRow {
  comment_id: string;
  brand: string | null;
  product_name: string | null;
  rating: number | null;
  comment_text: string | null;
  username: string | null;
  created_at: string | null;
  sentiment: string | null;
  category: string | null;
  severity: number | null;
  summary: string | null;
  suggested_action: string | null;
  urgent: boolean | null;
  status: string | null;
  assignee: string | null;
  note: string | null;
  images: string[] | null;
}

export interface CommentFilters {
  brand?: string;
  product?: string;
  sentiment?: string;
  category?: string;
  status?: string;
  urgentOnly?: boolean;
  minSeverity?: number;
  q?: string;
  from?: string; // ISO date
  to?: string;
  sort?: "created_desc" | "created_asc" | "severity_desc" | "rating_asc";
  page?: number;
  pageSize?: number;
}

const COMMENT_COLS =
  "comment_id, brand, product_name, rating, comment_text, username, created_at, sentiment, category, severity, summary, suggested_action, urgent, status, assignee, note, images";

export async function getProductStats(opts: { limit?: number; worstFirst?: boolean } = {}) {
  const sb = getServiceClient();
  if (!sb) return [] as ProductStat[];
  const { data, error } = await sb
    .from("product_stats")
    .select("*")
    .order("sentiment_score", { ascending: opts.worstFirst ?? true })
    .limit(opts.limit ?? 500);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductStat[];
}

export async function getProductStat(itemId: string): Promise<ProductStat | null> {
  const sb = getServiceClient();
  if (!sb) return null;
  const { data, error } = await sb.from("product_stats").select("*").eq("product_name", itemId).maybeSingle();
  if (error || !data) return null;
  return data as ProductStat;
}

/** สินค้าแบรนด์เดียวกัน (ไว้เปรียบเทียบในหน้าโปรไฟล์) */
export async function getSimilarProducts(itemId: string, brand: string | null, limit = 10) {
  const sb = getServiceClient();
  if (!sb || !brand) return [] as ProductStat[];
  const { data, error } = await sb
    .from("product_stats")
    .select("*")
    .eq("brand", brand)
    .neq("product_name", itemId)
    .gte("total", 2)
    .order("total", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as ProductStat[];
}

export async function getBrandStats() {
  const sb = getServiceClient();
  if (!sb) return [] as BrandStat[];
  const { data, error } = await sb.from("brand_stats").select("*").order("sentiment_score", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BrandStat[];
}

export interface DailyPoint {
  date: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  urgent: number;
  avg_rating: number | null;
  score: number;
}

export async function getDailyTrend(): Promise<DailyPoint[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data, error } = await sb.from("daily_trend").select("*").order("date", { ascending: true }).limit(800);
  if (error || !data) return [];
  return data.map((r) => ({
    date: String(r.date),
    total: Number(r.total),
    positive: Number(r.positive),
    neutral: Number(r.neutral),
    negative: Number(r.negative),
    urgent: Number(r.urgent),
    avg_rating: r.avg_rating != null ? Number(r.avg_rating) : null,
    score: Number(r.score),
  }));
}

export async function getDailyBrandTrend(): Promise<{ date: string; brand: string; total: number; urgent: number; score: number }[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data, error } = await sb.from("daily_brand_trend").select("*").order("date", { ascending: true }).limit(12000);
  if (error || !data) return [];
  return data.map((r) => ({ date: String(r.date), brand: String(r.brand), total: Number(r.total), urgent: Number(r.urgent), score: Number(r.score) }));
}

export async function getCategoryDaily(): Promise<{ date: string; category: string; total: number }[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data, error } = await sb.from("category_daily").select("*").order("date", { ascending: true }).limit(12000);
  if (error || !data) return [];
  return data.map((r) => ({ date: String(r.date), category: String(r.category), total: Number(r.total) }));
}

export async function getCategoryStats() {
  const sb = getServiceClient();
  if (!sb) return [] as { category: string; total: number }[];
  const { data, error } = await sb.from("category_stats").select("*").order("total", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as { category: string; total: number }[];
}

export async function listComments(f: CommentFilters): Promise<{ rows: CommentRow[]; total: number }> {
  const sb = getServiceClient();
  if (!sb) return { rows: [], total: 0 };

  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const fromIdx = (page - 1) * pageSize;

  let query = sb.from("comments").select(COMMENT_COLS, { count: "exact" });

  if (f.brand) query = query.eq("brand", f.brand);
  if (f.product) query = query.eq("product_name", f.product);
  if (f.sentiment) query = query.eq("sentiment", f.sentiment);
  if (f.category) query = query.eq("category", f.category);
  if (f.status) query = query.eq("status", f.status);
  if (f.urgentOnly) query = query.eq("urgent", true);
  if (typeof f.minSeverity === "number") query = query.gte("severity", f.minSeverity);
  if (f.from) query = query.gte("created_at", f.from);
  if (f.to) query = query.lte("created_at", f.to);
  if (f.q) query = query.ilike("comment_text", `%${f.q}%`);

  switch (f.sort) {
    case "created_asc":
      query = query.order("created_at", { ascending: true });
      break;
    case "severity_desc":
      query = query.order("severity", { ascending: false }).order("created_at", { ascending: false });
      break;
    case "rating_asc":
      query = query.order("rating", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(fromIdx, fromIdx + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as CommentRow[], total: count ?? 0 };
}

export async function updateTriage(
  commentId: string,
  fields: { status?: string; assignee?: string; note?: string }
) {
  const sb = getServiceClient();
  if (!sb) throw new Error("ยังไม่ได้เชื่อม Supabase");
  const patch: Record<string, unknown> = { ...fields };
  if (fields.status === "resolved") patch.handled_at = new Date().toISOString();
  const { error } = await sb.from("comments").update(patch).eq("comment_id", commentId);
  if (error) throw new Error(error.message);
  return true;
}

export async function getRuns(limit = 20) {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("pipeline_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface RetentionSummary { scope: string; customers: number; repeat_customers: number; one_time: number; total_orders: number; repeat_rate: number; avg_orders: number }
export interface RfmSegment { segment: string; customers: number; avg_recency: number; avg_frequency: number; avg_monetary: number; total_spend: number }
export interface RetentionBundle {
  summary: RetentionSummary[];
  monthly: { month: string; new_customers: number; returning_customers: number; orders: number }[];
  distribution: { bucket: string; customers: number }[];
  topCustomers: { buyer: string; orders: number; spend: number; first_order: string | null; last_order: string | null; brands: string }[];
  cohort: { cohort: string; months_since: number; customers: number }[];
  rfm: RfmSegment[];
  atRisk: { buyer: string; orders: number; spend: number; last_order: string | null; days_since: number; brands: string }[];
  gap: { bucket: string; n: number }[];
  brandmix: { bucket: string; customers: number }[];
  review: { grp: string; customers: number; repeat_rate: number }[];
  kpi: Record<string, number>;
}

export async function getRetention(): Promise<RetentionBundle> {
  const sb = getServiceClient();
  const empty: RetentionBundle = { summary: [], monthly: [], distribution: [], topCustomers: [], cohort: [], rfm: [], atRisk: [], gap: [], brandmix: [], review: [], kpi: {} };
  if (!sb) return empty;
  const [s, m, d, t, co, rf, ar, kp, gp, bm, rv] = await Promise.all([
    sb.from("retention_summary").select("*"),
    sb.from("retention_monthly").select("*").order("month", { ascending: true }),
    sb.from("retention_distribution").select("*").order("bucket", { ascending: true }),
    sb.from("top_customers").select("*").order("orders", { ascending: false }).limit(100),
    sb.from("retention_cohort").select("*").order("cohort", { ascending: true }).limit(1000),
    sb.from("rfm_segments").select("*"),
    sb.from("at_risk_customers").select("*").order("spend", { ascending: false }).limit(100),
    sb.from("retention_kpi").select("*"),
    sb.from("retention_gap").select("*"),
    sb.from("retention_brandmix").select("*"),
    sb.from("retention_review").select("*"),
  ]);
  const kpi: Record<string, number> = {};
  for (const row of (kp.data as { key: string; value: number }[]) ?? []) kpi[row.key] = Number(row.value);
  return {
    summary: (s.data as RetentionSummary[]) ?? [],
    monthly: (m.data as RetentionBundle["monthly"]) ?? [],
    distribution: (d.data as RetentionBundle["distribution"]) ?? [],
    topCustomers: (t.data as RetentionBundle["topCustomers"]) ?? [],
    cohort: (co.data as RetentionBundle["cohort"]) ?? [],
    rfm: (rf.data as RfmSegment[]) ?? [],
    atRisk: (ar.data as RetentionBundle["atRisk"]) ?? [],
    gap: (gp.data as RetentionBundle["gap"]) ?? [],
    brandmix: (bm.data as RetentionBundle["brandmix"]) ?? [],
    review: (rv.data as RetentionBundle["review"]) ?? [],
    kpi,
  };
}

/** ค่าที่ไม่ซ้ำสำหรับเติม dropdown ฟิลเตอร์ (brand/category) */
export async function getDistinct(): Promise<{ brands: string[]; categories: string[] }> {
  const sb = getServiceClient();
  if (!sb) return { brands: [], categories: [] };
  const [b, c] = await Promise.all([sb.from("brand_stats").select("brand"), sb.from("category_stats").select("category")]);
  return {
    brands: (b.data ?? []).map((r) => r.brand as string).filter(Boolean),
    categories: (c.data ?? []).map((r) => r.category as string).filter(Boolean),
  };
}
