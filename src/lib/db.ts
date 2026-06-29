// ตัวช่วย query Supabase สำหรับหน้า Products / Explore / Triage / Trends / Settings
import { getServiceClient } from "./supabase";
import type { ProductCatalogRow } from "./product-analytics";

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
  shop_id: string | null;
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
  seller_reply: string | null;
  seller_reply_at: string | null;
  seller_reply_hidden: boolean | null;
  images: string[] | null;
  // เสริมจากตาราง products (join ด้วย product_name = item_id)
  product_item_name: string | null;   // ชื่อสินค้าจริง (อ่านได้)
  product_image: string | null;       // รูปสินค้า (thumbnail/หลัก)
}

export interface CommentFilters {
  brand?: string;
  product?: string;
  sentiment?: string;
  category?: string;
  status?: string;
  assignee?: string;
  brandsIn?: string[]; // จำกัดเฉพาะแบรนด์เหล่านี้ (สิทธิ์การเข้าถึง)
  urgentOnly?: boolean;
  replied?: "yes" | "no"; // มีคำตอบจากผู้ขายแล้ว / ยังไม่มี
  minSeverity?: number;
  q?: string;
  from?: string; // ISO date
  to?: string;
  sort?: "created_desc" | "created_asc" | "severity_desc" | "rating_asc";
  page?: number;
  pageSize?: number;
}

const COMMENT_COLS =
  "comment_id, brand, shop_id, product_name, rating, comment_text, username, created_at, sentiment, category, severity, summary, suggested_action, urgent, status, assignee, note, seller_reply, seller_reply_at, seller_reply_hidden, images";

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

/** ดึงชื่อสินค้าจริง + รูป จากตาราง products ตาม item_id (= comments.product_name) */
async function productMetaMap(sb: ReturnType<typeof getServiceClient>, itemIds: (string | null)[]): Promise<Map<string, { name: string | null; img: string | null }>> {
  const map = new Map<string, { name: string | null; img: string | null }>();
  if (!sb) return map;
  const ids = [...new Set(itemIds.filter(Boolean) as string[])];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from("products").select("item_id, item_name, thumbnail_url, image_url").in("item_id", ids.slice(i, i + 300));
    for (const p of data ?? []) map.set(String(p.item_id), { name: (p.item_name as string) ?? null, img: ((p.thumbnail_url as string) || (p.image_url as string)) || null });
  }
  return map;
}

export async function listComments(f: CommentFilters): Promise<{ rows: CommentRow[]; total: number }> {
  const sb = getServiceClient();
  if (!sb) return { rows: [], total: 0 };

  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const fromIdx = (page - 1) * pageSize;

  let query = sb.from("comments").select(COMMENT_COLS, { count: "exact" });

  if (f.brandsIn && f.brandsIn.length) query = query.in("brand", f.brandsIn);
  if (f.brand) query = query.eq("brand", f.brand);
  if (f.product) query = query.eq("product_name", f.product);
  if (f.sentiment) query = query.eq("sentiment", f.sentiment);
  if (f.category) query = query.eq("category", f.category);
  if (f.status) query = query.eq("status", f.status);
  if (f.assignee) query = query.eq("assignee", f.assignee);
  if (f.urgentOnly) query = query.eq("urgent", true);
  if (f.replied === "yes") query = query.not("seller_reply", "is", null);
  if (f.replied === "no") query = query.is("seller_reply", null);
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
  const base = (data ?? []) as CommentRow[];
  const meta = await productMetaMap(sb, base.map((r) => r.product_name));
  const rows = base.map((r) => { const m = r.product_name ? meta.get(r.product_name) : null; return { ...r, product_item_name: m?.name ?? null, product_image: m?.img ?? null }; });
  return { rows, total: count ?? 0 };
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

// ---------- ทีม / กิจกรรม ----------
export interface TeamMember { name: string; role: string | null; updated_at?: string }
export interface Activity { id: number; actor: string | null; action: string | null; comment_id: string | null; detail: string | null; created_at: string }

export async function getTeam(): Promise<TeamMember[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb.from("team_members").select("*").order("name");
  return (data as TeamMember[]) ?? [];
}
export async function upsertTeamMember(name: string, role?: string): Promise<void> {
  const sb = getServiceClient();
  if (!sb || !name.trim()) return;
  await sb.from("team_members").upsert({ name: name.trim(), role: role || null, updated_at: new Date().toISOString() }, { onConflict: "name" });
}
export async function getActivity(limit = 50): Promise<Activity[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb.from("activity_log").select("*").order("created_at", { ascending: false }).limit(limit);
  return (data as Activity[]) ?? [];
}
export async function logActivity(a: { actor?: string | null; action: string; comment_id?: string | null; detail?: string | null }): Promise<void> {
  const sb = getServiceClient();
  if (!sb) return;
  await sb.from("activity_log").insert({ actor: a.actor || null, action: a.action, comment_id: a.comment_id || null, detail: a.detail || null });
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
// ---- การตอบกลับของทีม (ใครตอบอะไรไปบ้าง) ----
export interface ReplyRecord {
  comment_id: string;
  reply_text: string | null;
  status: string | null;
  replied_by: string | null;
  platform_response: string | null;
  updated_at: string | null;
  // เสริมจาก comments
  brand: string | null;
  product_name: string | null;
  shop_id: string | null;
  comment_text: string | null;
  sentiment: string | null;
  rating: number | null;
  created_at: string | null;        // เวลาที่ลูกค้าคอมเมนต์
  product_item_name: string | null;
  product_image: string | null;
  replier_avatar: string | null;    // รูปโปรไฟล์ของผู้ตอบ
}

export interface SystemUser { id: string; name: string; email: string | null; avatar_url: string | null; role: string }
/** ผู้ใช้จริงในระบบ (active) — ใช้ทำรายการมอบหมายงาน + จับคู่ avatar */
export async function getSystemUsers(): Promise<SystemUser[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const { data } = await sb.from("profiles").select("id, name, email, avatar_url, role").eq("active", true).order("name");
  return (data ?? []).map((p) => ({ id: String(p.id), name: (p.name as string) || (p.email as string) || "ไม่ระบุ", email: (p.email as string) ?? null, avatar_url: (p.avatar_url as string) ?? null, role: (p.role as string) || "staff" }));
}

/** map ชื่อผู้ใช้ → avatar (สำหรับแสดงรูปคนตอบ/ผู้รับผิดชอบ) */
async function avatarByName(sb: ReturnType<typeof getServiceClient>): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!sb) return m;
  const { data } = await sb.from("profiles").select("name, avatar_url");
  for (const p of data ?? []) if (p.name && p.avatar_url) m.set(String(p.name), String(p.avatar_url));
  return m;
}

export interface ReplyAgentStat { name: string; sent: number; failed: number; draft: number; total: number; last_at: string | null; avatar: string | null }

/** คำนวณสถิติรายผู้ตอบจากรายการตอบกลับ (ใช้เมื่อ scope ตามแบรนด์) */
export function agentStatsFromReplies(replies: ReplyRecord[]): ReplyAgentStat[] {
  const agg = new Map<string, ReplyAgentStat>();
  for (const r of replies) {
    const name = r.replied_by || "ไม่ระบุ";
    const a = agg.get(name) ?? { name, sent: 0, failed: 0, draft: 0, total: 0, last_at: null, avatar: r.replier_avatar };
    a.total++;
    if (r.status === "sent") a.sent++; else if (r.status === "failed") a.failed++; else a.draft++;
    if (r.updated_at && (!a.last_at || r.updated_at > a.last_at)) a.last_at = r.updated_at;
    if (!a.avatar && r.replier_avatar) a.avatar = r.replier_avatar;
    agg.set(name, a);
  }
  return [...agg.values()].sort((a, b) => b.total - a.total);
}

/** รายการตอบกลับทั้งหมด (กรองตามแอดมิน/สถานะ/ค้นหา) + ข้อมูลคอมเมนต์ */
export async function getReplies(opts: { repliedBy?: string; status?: string; q?: string; limit?: number; brandsIn?: string[] | null } = {}): Promise<ReplyRecord[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  let q = sb.from("comment_replies").select("comment_id, reply_text, status, replied_by, platform_response, updated_at").order("updated_at", { ascending: false }).limit(opts.limit ?? 500);
  if (opts.repliedBy) q = q.eq("replied_by", opts.repliedBy);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error || !data) return [];

  // ดึงข้อมูลคอมเมนต์ของรายการเหล่านี้
  const ids = data.map((r) => String(r.comment_id));
  const info = new Map<string, { brand: string | null; product_name: string | null; shop_id: string | null; comment_text: string | null; sentiment: string | null; rating: number | null; created_at: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: cs } = await sb.from("comments").select("comment_id, brand, product_name, shop_id, comment_text, sentiment, rating, created_at").in("comment_id", ids.slice(i, i + 300));
    for (const c of cs ?? []) info.set(String(c.comment_id), { brand: c.brand as string, product_name: c.product_name as string, shop_id: c.shop_id as string, comment_text: c.comment_text as string, sentiment: c.sentiment as string, rating: c.rating as number, created_at: (c.created_at as string) ?? null });
  }

  // ชื่อสินค้าจริง + รูป + รูปผู้ตอบ
  const meta = await productMetaMap(sb, [...info.values()].map((c) => c.product_name));
  const avatars = await avatarByName(sb);
  let rows: ReplyRecord[] = data.map((r) => {
    const c = info.get(String(r.comment_id));
    const m = c?.product_name ? meta.get(c.product_name) : null;
    return {
      comment_id: String(r.comment_id), reply_text: r.reply_text as string, status: r.status as string, replied_by: r.replied_by as string,
      platform_response: r.platform_response as string, updated_at: r.updated_at as string,
      brand: c?.brand ?? null, product_name: c?.product_name ?? null, shop_id: c?.shop_id ?? null,
      comment_text: c?.comment_text ?? null, sentiment: c?.sentiment ?? null, rating: c?.rating ?? null,
      created_at: c?.created_at ?? null,
      product_item_name: m?.name ?? null, product_image: m?.img ?? null,
      replier_avatar: r.replied_by ? avatars.get(String(r.replied_by)) ?? null : null,
    };
  });
  // จำกัดสิทธิ์ตามแบรนด์ (เคร่งครัด): ผู้ใช้ที่ถูกจำกัดเห็นเฉพาะแบรนด์ตน
  if (opts.brandsIn && opts.brandsIn.length) {
    const set = new Set(opts.brandsIn);
    rows = rows.filter((r) => r.brand != null && set.has(r.brand));
  }
  if (opts.q) {
    const t = opts.q.toLowerCase();
    rows = rows.filter((r) => (r.reply_text || "").toLowerCase().includes(t) || (r.comment_text || "").toLowerCase().includes(t));
  }
  return rows;
}

/** สรุปการตอบกลับรายแอดมิน (ใครตอบกี่ครั้ง สำเร็จ/ล้มเหลว) */
export async function getReplyAgentStats(): Promise<ReplyAgentStat[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const agg = new Map<string, ReplyAgentStat>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("comment_replies").select("replied_by, status, updated_at").range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) {
      const name = (r.replied_by as string) || "ไม่ระบุ";
      const a = agg.get(name) ?? { name, sent: 0, failed: 0, draft: 0, total: 0, last_at: null, avatar: null };
      a.total++;
      if (r.status === "sent") a.sent++;
      else if (r.status === "failed") a.failed++;
      else a.draft++;
      const at = r.updated_at as string;
      if (at && (!a.last_at || at > a.last_at)) a.last_at = at;
      agg.set(name, a);
    }
    if (data.length < 1000) break;
  }
  return [...agg.values()].sort((a, b) => b.total - a.total);
}

/** รายชื่อแอดมินที่เคยตอบกลับ (สำหรับตัวกรอง) */
export async function getReplyAgents(): Promise<string[]> {
  const stats = await getReplyAgentStats();
  return stats.map((s) => s.name).filter((n) => n !== "ไม่ระบุ");
}

// ---- พยากรณ์สินค้า & สต๊อก ----
export async function getProductCatalog(opts: { brand?: string; q?: string; limit?: number } = {}): Promise<ProductCatalogRow[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  let q = sb.from("product_catalog").select("product_id, platform, name, brand, stock, reserved, stock_at, avg_daily_30, avg_daily_90, units_90").order("units_90", { ascending: false, nullsFirst: false }).limit(opts.limit ?? 3000);
  if (opts.brand) q = q.eq("brand", opts.brand);
  const { data, error } = await q;
  if (error || !data) return [];
  let rows = data as unknown as ProductCatalogRow[];
  if (opts.q) {
    const t = opts.q.toLowerCase();
    rows = rows.filter((r) => (r.name || "").toLowerCase().includes(t) || (r.brand || "").toLowerCase().includes(t) || r.product_id.includes(t));
  }
  return rows;
}

export async function getProductCatalogOne(productId: string): Promise<ProductCatalogRow | null> {
  const sb = getServiceClient();
  if (!sb) return null;
  const { data } = await sb.from("product_catalog").select("product_id, platform, name, brand, stock, reserved, stock_at, avg_daily_30, avg_daily_90, units_90").eq("product_id", productId).maybeSingle();
  return (data as unknown as ProductCatalogRow) ?? null;
}

export async function getProductBrands(): Promise<string[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const set = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("product_catalog").select("brand").range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) if (r.brand) set.add(String(r.brand));
    if (data.length < 1000) break;
  }
  return [...set].sort();
}

export async function getProductDemand(productId: string): Promise<{ date: string; units: number; gmv: number }[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const out: { date: string; units: number; gmv: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("product_demand_daily").select("date, units, gmv").eq("product_id", productId).order("date", { ascending: true }).range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) out.push({ date: String(r.date), units: Number(r.units) || 0, gmv: Number(r.gmv) || 0 });
    if (data.length < 1000) break;
  }
  return out;
}

/** ประวัติสต๊อกรายวันของสินค้า (ใช้ตรวจ "วันของหมด" / censored demand) */
export async function getProductStockDaily(productId: string): Promise<{ date: string; stock: number | null; reserved: number | null }[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const out: { date: string; stock: number | null; reserved: number | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("product_stock_daily").select("date, stock, reserved").eq("product_id", productId).order("date", { ascending: true }).range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) out.push({ date: String(r.date), stock: r.stock == null ? null : Number(r.stock), reserved: r.reserved == null ? null : Number(r.reserved) });
    if (data.length < 1000) break;
  }
  return out;
}

export interface MlForecast {
  meta: { model: string; wape: number | null; n_history: number | null; horizon: number | null; generated_at: string } | null;
  points: { date: string; yhat: number; lower: number; upper: number }[];
}
/** ผลพยากรณ์จาก ML sidecar (Nixtla) — คืน null ถ้ายังไม่เคยรัน */
export async function getProductForecastMl(productId: string): Promise<MlForecast> {
  const sb = getServiceClient();
  if (!sb) return { meta: null, points: [] };
  const [{ data: meta }, { data: pts }] = await Promise.all([
    sb.from("product_forecast_ml_meta").select("model, wape, n_history, horizon, generated_at").eq("product_id", productId).maybeSingle(),
    sb.from("product_forecast_ml").select("ds, yhat, yhat_lower, yhat_upper").eq("product_id", productId).order("ds", { ascending: true }),
  ]);
  return {
    meta: meta ? { model: String(meta.model), wape: meta.wape == null ? null : Number(meta.wape), n_history: meta.n_history == null ? null : Number(meta.n_history), horizon: meta.horizon == null ? null : Number(meta.horizon), generated_at: String(meta.generated_at) } : null,
    points: (pts ?? []).map((r) => ({ date: String(r.ds), yhat: Number(r.yhat) || 0, lower: Number(r.yhat_lower) || 0, upper: Number(r.yhat_upper) || 0 })),
  };
}

export interface SentimentDay { date: string; count: number; avgRating: number | null; pos: number; neg: number; neu: number; net: number }
/** รวมรีวิว/คอมเมนต์รายวันของสินค้า → ใช้เป็นสัญญาณนำ (leading indicator) ของยอดขาย */
export async function getProductSentimentDaily(productId: string): Promise<SentimentDay[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const byDay = new Map<string, { n: number; ratings: number[]; pos: number; neg: number; neu: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("comments").select("created_at, rating, sentiment").eq("product_id", productId).order("created_at", { ascending: true }).range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) {
      if (!r.created_at) continue;
      const date = String(r.created_at).slice(0, 10);
      const b = byDay.get(date) ?? { n: 0, ratings: [], pos: 0, neg: 0, neu: 0 };
      b.n++;
      if (r.rating != null) b.ratings.push(Number(r.rating));
      const s = (r.sentiment as string) || "";
      if (s === "positive") b.pos++; else if (s === "negative") b.neg++; else b.neu++;
      byDay.set(date, b);
    }
    if (data.length < 1000) break;
  }
  return [...byDay.entries()].sort().map(([date, b]) => ({
    date, count: b.n,
    avgRating: b.ratings.length ? +(b.ratings.reduce((s, x) => s + x, 0) / b.ratings.length).toFixed(2) : null,
    pos: b.pos, neg: b.neg, neu: b.neu,
    net: b.n ? +((b.pos - b.neg) / b.n).toFixed(3) : 0,
  }));
}

export interface EnvDayRow { date: string; pm2_5: number | null; temp_mean: number | null; temp_max: number | null; precip: number | null }
export async function getEnvDaily(): Promise<EnvDayRow[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const out: EnvDayRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("env_daily").select("date, pm2_5, temp_mean, temp_max, precip").order("date", { ascending: true }).range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) out.push({ date: String(r.date), pm2_5: r.pm2_5 as number, temp_mean: r.temp_mean as number, temp_max: r.temp_max as number, precip: r.precip as number });
    if (data.length < 1000) break;
  }
  return out;
}

// ---- ยอดขายรายวัน (Forecasting) ----
export interface GmvDayRow { date: string; gmv: number; units: number; net_sales: number | null }

export async function getGmvDaily(scope = "ALL"): Promise<GmvDayRow[]> {
  const sb = getServiceClient();
  if (!sb) return [];
  const out: GmvDayRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("gmv_daily")
      .select("date,gmv,units,net_sales")
      .eq("scope", scope)
      .order("date", { ascending: true })
      .range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) out.push({ date: String(r.date), gmv: Number(r.gmv) || 0, units: Number(r.units) || 0, net_sales: r.net_sales == null ? null : Number(r.net_sales) });
    if (data.length < 1000) break;
  }
  return out;
}

/** รายชื่อ scope ที่มีข้อมูล (สำหรับตัวกรอง) */
export async function getGmvScopes(): Promise<{ platforms: string[]; brands: string[] }> {
  const sb = getServiceClient();
  if (!sb) return { platforms: [], brands: [] };
  const platforms = new Set<string>(), brands = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("gmv_daily").select("scope").range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) {
      const s = String(r.scope);
      if (s.startsWith("platform:")) platforms.add(s.slice(9));
      else if (s.startsWith("brand:")) brands.add(s.slice(6));
    }
    if (data.length < 1000) break;
  }
  return { platforms: [...platforms].sort(), brands: [...brands].sort() };
}

export async function getDistinct(): Promise<{ brands: string[]; categories: string[] }> {
  const sb = getServiceClient();
  if (!sb) return { brands: [], categories: [] };
  const [b, c] = await Promise.all([sb.from("brand_stats").select("brand"), sb.from("category_stats").select("category")]);
  return {
    brands: (b.data ?? []).map((r) => r.brand as string).filter(Boolean),
    categories: (c.data ?? []).map((r) => r.category as string).filter(Boolean),
  };
}
