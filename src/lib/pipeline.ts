// Pipeline หลัก: ดึงเฉพาะคอมเมนต์ใหม่จาก BigQuery → วิเคราะห์ → upsert Supabase → คำนวณ snapshot/trend
import { SupabaseClient } from "@supabase/supabase-js";
import { aggregate } from "./aggregate";
import { analyze } from "./analyzer";
import { fetchActiveProductDemand, fetchGmvDaily, fetchNewComments, fetchProductStock, fetchProducts, fetchRetention } from "./bigquery";
import { fetchEnvDaily } from "./env";
import { PIPELINE } from "./config";
import { getServiceClient } from "./supabase";
import { clean } from "./text";
import type { AnalyzedComment } from "./types";

export interface RunResult {
  fetched: number;
  analyzed: number;
  watermark: string | null;
  total_in_window: number;
  direction: string;
  overall_score: number;
  urgent_total: number;
}

/** watermark = created_at ล่าสุดใน Supabase ลบด้วย overlap เผื่อคาบเกี่ยว */
async function getWatermark(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb
    .from("comments")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.created_at) return null;
  const t = new Date(data.created_at as string);
  t.setMinutes(t.getMinutes() - PIPELINE.overlapMinutes);
  return t.toISOString();
}

function toRow(c: AnalyzedComment) {
  return {
    comment_id: c.comment_id,
    brand: c.brand,
    shop_id: c.shop_id,
    shop_name: c.shop_name,
    product_name: c.product_name,
    product_id: c.product_id,
    rating: c.rating,
    comment_text: clean(c.comment_text),
    username: c.username,
    created_at: c.created_at,
    order_id: c.order_id,
    seller_reply: c.seller_reply ? clean(c.seller_reply) : null,
    seller_reply_at: c.seller_reply_at,
    seller_reply_hidden: c.seller_reply_hidden,
    images: c.images ?? [],
    sentiment: c.sentiment,
    category: c.category,
    severity: c.severity,
    summary: clean(c.summary),
    suggested_action: clean(c.suggested_action),
    urgent: c.urgent,
    analyzed_by: c.analyzed_by,
    model: c.model,
    analyzed_at: new Date().toISOString(),
  };
}

/** อ่านคอมเมนต์ในหน้าต่างเวลา (windowDays) กลับมาเป็น AnalyzedComment เพื่อ aggregate */
async function loadWindow(sb: SupabaseClient, windowDays: number): Promise<AnalyzedComment[]> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const out: AnalyzedComment[] = [];
  const pageSize = 1000;
  let from = 0;
  // ดึงเป็นหน้า ๆ กัน limit 1000 ของ Supabase
  for (;;) {
    const { data, error } = await sb
      .from("comments")
      .select(
        "comment_id, brand, shop_id, shop_name, product_name, product_id, rating, comment_text, username, created_at, order_id, seller_reply, seller_reply_at, seller_reply_hidden, images, sentiment, category, severity, summary, suggested_action, urgent, analyzed_by, model"
      )
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`อ่าน comments จาก Supabase ไม่สำเร็จ: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as unknown as AnalyzedComment[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

/** รายการ item_id ทั้งหมดที่มีในคอมเมนต์ (จาก view product_stats) */
async function allProductIds(sb: SupabaseClient): Promise<string[]> {
  const out: string[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from("product_stats").select("product_name").range(from, from + pageSize - 1);
    if (error) throw new Error(`อ่าน product_stats ไม่สำเร็จ: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...data.map((r) => String(r.product_name)));
    if (data.length < pageSize) break;
  }
  return out;
}

/** ดึงชื่อ/SKU/รูป/ราคา จาก shopee_items มาเก็บตาราง products (ทำให้ dashboard โชว์ชื่อแทนเลข) */
async function syncProducts(sb: SupabaseClient, productIds: string[]): Promise<number> {
  const ids = Array.from(new Set(productIds.filter((x) => x && x !== "(ไม่ระบุสินค้า)")));
  if (ids.length === 0) return 0;
  const metas = await fetchProducts(ids);
  if (metas.length === 0) return 0;
  const rows = metas.map((m) => ({
    item_id: m.item_id,
    item_name: m.item_name,
    item_sku: m.item_sku,
    model_sku: m.model_sku,
    brand: m.brand,
    price: m.price,
    category_id: m.category_id,
    thumbnail_url: m.thumbnail_url,
    image_url: m.image_url,
    rating_star: m.rating_star,
    comment_count: m.comment_count,
    views: m.views,
    likes: m.likes,
    stock: m.stock,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("products").upsert(rows.slice(i, i + 500), { onConflict: "item_id" });
    if (error) throw new Error(`upsert products ไม่สำเร็จ: ${error.message}`);
  }
  console.log(`[pipeline] sync สินค้า ${rows.length} รายการ`);
  return rows.length;
}

/** สรุป Customer Retention จาก BigQuery → Supabase (retention เปลี่ยนช้า → รันสัปดาห์ละครั้งพอ คุมค่า BQ) */
async function syncRetention(sb: SupabaseClient, force = false): Promise<void> {
  if (!force) {
    const { data: last } = await sb.from("retention_summary").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.updated_at) {
      const ageDays = (Date.now() - new Date(last.updated_at as string).getTime()) / 86400000;
      if (ageDays < 6) {
        console.log(`[pipeline] ข้าม retention (อัปเดตล่าสุด ${ageDays.toFixed(1)} วันก่อน)`);
        return;
      }
    }
  }
  const data = await fetchRetention();
  const now = new Date().toISOString();
  if (data.summary.length) await sb.from("retention_summary").upsert(data.summary.map((s) => ({ ...s, updated_at: now })), { onConflict: "scope" });
  if (data.monthly.length) await sb.from("retention_monthly").upsert(data.monthly, { onConflict: "month" });
  if (data.distribution.length) await sb.from("retention_distribution").upsert(data.distribution, { onConflict: "bucket" });
  if (data.rfm.length) await sb.from("rfm_segments").upsert(data.rfm.map((r) => ({ ...r, updated_at: now })), { onConflict: "segment" });

  // ตารางที่ต้องล้างก่อน (กันรายการเก่าค้าง)
  await sb.from("top_customers").delete().gt("orders", -1);
  if (data.topCustomers.length)
    await sb.from("top_customers").insert(data.topCustomers.map((t) => ({ ...t, first_order: t.first_order || null, last_order: t.last_order || null, updated_at: now })));
  await sb.from("at_risk_customers").delete().gt("orders", -1);
  if (data.atRisk.length)
    await sb.from("at_risk_customers").insert(data.atRisk.map((t) => ({ ...t, last_order: t.last_order || null, updated_at: now })));
  await sb.from("retention_cohort").delete().neq("cohort", "___none___");
  if (data.cohort.length) await sb.from("retention_cohort").insert(data.cohort);

  if (data.gap.length) await sb.from("retention_gap").upsert(data.gap, { onConflict: "bucket" });
  if (data.brandmix.length) await sb.from("retention_brandmix").upsert(data.brandmix, { onConflict: "bucket" });
  if (data.review.length) await sb.from("retention_review").upsert(data.review, { onConflict: "grp" });
  await sb.from("retention_kpi").upsert(
    Object.entries(data.kpi).map(([key, value]) => ({ key, value, updated_at: now })),
    { onConflict: "key" }
  );
  console.log(`[pipeline] sync retention: ${data.summary.length} scopes, ${data.rfm.length} segments, ${data.cohort.length} cohort cells, at-risk ${data.atRisk.length}`);
}

/** บังคับ sync retention เดี๋ยวนี้ (สำหรับ npm run retention) */
export async function runRetentionSync(): Promise<void> {
  const sb = getServiceClient();
  if (!sb) throw new Error("ยังไม่ได้เชื่อม Supabase");
  await syncRetention(sb, true);
}

/** บังคับ sync GMV เดี๋ยวนี้ (สำหรับ npm run gmv) */
export async function runGmvSync(): Promise<void> {
  const sb = getServiceClient();
  if (!sb) throw new Error("ยังไม่ได้เชื่อม Supabase");
  await syncGmv(sb, true);
}

const dayStr = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };

/** sync ปัจจัยแวดล้อม (อากาศ + PM2.5) จาก Open-Meteo */
async function syncEnv(sb: SupabaseClient, force = false): Promise<void> {
  let start = dayStr(-760); // ~2 ปี
  if (!force) {
    const { data } = await sb.from("env_daily").select("date").order("date", { ascending: false }).limit(1).maybeSingle();
    if (data?.date) start = dayStr(-20); // incremental: เติม 20 วันล่าสุด + อนาคต
  }
  const rows = await fetchEnvDaily(start, dayStr(16));
  if (!rows.length) return;
  const payload = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb.from("env_daily").upsert(payload.slice(i, i + 500), { onConflict: "date" });
    if (error) throw new Error(`upsert env_daily: ${error.message}`);
  }
  console.log(`[pipeline] sync env ${rows.length} วัน`);
}

/** sync ดีมานด์รายสินค้า + สต๊อก + สรุป → product_demand_daily / product_catalog */
async function syncProductForecast(sb: SupabaseClient): Promise<void> {
  const demand = await fetchActiveProductDemand(540);
  // 1) upsert ยอดขายรายวัน
  const dd = demand.map((r) => ({ product_id: r.product_id, date: r.date, units: r.units, gmv: r.gmv }));
  for (let i = 0; i < dd.length; i += 500) {
    const { error } = await sb.from("product_demand_daily").upsert(dd.slice(i, i + 500), { onConflict: "product_id,date" });
    if (error) throw new Error(`upsert product_demand_daily: ${error.message}`);
  }

  // 2) สรุปดีมานด์ต่อสินค้า (30/90 วัน)
  const c30 = dayStr(-30), c90 = dayStr(-90);
  interface Agg { product_id: string; name: string | null; brand: string | null; platform: string | null; u30: number; u90: number }
  const agg = new Map<string, Agg>();
  for (const r of demand) {
    const a = agg.get(r.product_id) ?? { product_id: r.product_id, name: r.product_name, brand: r.brand, platform: r.platform, u30: 0, u90: 0 };
    if (r.date >= c90) a.u90 += r.units;
    if (r.date >= c30) a.u30 += r.units;
    if (!a.name && r.product_name) a.name = r.product_name;
    if (!a.brand && r.brand) a.brand = r.brand;
    agg.set(r.product_id, a);
  }

  // 3) สต๊อกล่าสุด
  const stock = await fetchProductStock();
  const stockMap = new Map(stock.map((s) => [s.product_id, s]));
  const now = new Date().toISOString();

  // 4) upsert ทะเบียนสินค้า (เฉพาะสินค้าที่ยังเคลื่อนไหว)
  const rows = [...agg.values()].map((a) => {
    const s = stockMap.get(a.product_id);
    return {
      product_id: a.product_id, platform: a.platform, name: a.name, brand: a.brand,
      stock: s ? s.stock : null, reserved: s ? s.reserved : null, stock_at: s ? now : null,
      avg_daily_30: +(a.u30 / 30).toFixed(3), avg_daily_90: +(a.u90 / 90).toFixed(3), units_90: a.u90,
      updated_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("product_catalog").upsert(rows.slice(i, i + 500), { onConflict: "product_id" });
    if (error) throw new Error(`upsert product_catalog: ${error.message}`);
  }

  // 5) บันทึก snapshot สต๊อกของ"วันนี้" → product_stock_daily (สะสมเป็นประวัติไว้วิเคราะห์วันของหมด)
  const today = dayStr(0);
  const snap = stock.map((s) => ({ product_id: s.product_id, date: today, stock: s.stock, reserved: s.reserved, updated_at: now }));
  for (let i = 0; i < snap.length; i += 500) {
    const { error } = await sb.from("product_stock_daily").upsert(snap.slice(i, i + 500), { onConflict: "product_id,date" });
    if (error) throw new Error(`upsert product_stock_daily: ${error.message}`);
  }
  console.log(`[pipeline] sync product forecast: ${rows.length} สินค้า, ${dd.length} แถวยอดขาย, สต๊อก ${stock.length} (snapshot ${snap.length})`);
}

/** บังคับ sync ปัจจัยแวดล้อม (npm run env) */
export async function runEnvSync(): Promise<void> {
  const sb = getServiceClient();
  if (!sb) throw new Error("ยังไม่ได้เชื่อม Supabase");
  await syncEnv(sb, true);
}

/** บังคับ sync พยากรณ์สินค้า (npm run product-forecast) */
export async function runProductForecastSync(): Promise<void> {
  const sb = getServiceClient();
  if (!sb) throw new Error("ยังไม่ได้เชื่อม Supabase");
  await syncProductForecast(sb);
}

/** sync ยอดขายรายวันจาก BigQuery → Supabase (ข้ามถ้าข้อมูลล่าสุดทันสมัยแล้ว) */
async function syncGmv(sb: SupabaseClient, force = false): Promise<void> {
  if (!force) {
    const { data } = await sb.from("gmv_daily").select("date").eq("scope", "ALL").order("date", { ascending: false }).limit(1).maybeSingle();
    if (data?.date) {
      const last = new Date(data.date as string);
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      if (last >= new Date(yesterday.toISOString().slice(0, 10))) { console.log("[pipeline] ข้าม GMV (ทันสมัยแล้ว)"); return; }
    }
  }
  const rows = await fetchGmvDaily();
  const payload = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb.from("gmv_daily").upsert(payload.slice(i, i + 500), { onConflict: "scope,date" });
    if (error) throw new Error(`upsert gmv_daily: ${error.message}`);
  }
  console.log(`[pipeline] sync GMV ${rows.length} แถว`);
}

/**
 * @param opts.light = true → ทำเฉพาะ "ดึง+วิเคราะห์คอมเมนต์ + สรุป" (เร็ว, สำหรับปุ่มบนหน้าเว็บ)
 *   ข้ามงานหนักจาก BigQuery (สินค้า/retention/GMV/อากาศ/พยากรณ์) ที่ใช้เวลานานจน Render 502
 *   → งานหนักให้ cron รายวันทำ (npm run pipeline = full)
 */
export async function runPipeline(opts: { light?: boolean } = {}): Promise<RunResult> {
  const sb = getServiceClient();
  if (!sb) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — pipeline ต้องใช้ Supabase"
    );
  }

  const { data: runRow } = await sb
    .from("pipeline_runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  const runId = runRow?.id;

  try {
    // 1) watermark + ดึงเฉพาะใหม่
    const watermark = await getWatermark(sb);
    const fresh = await fetchNewComments({
      sinceTimestamp: watermark,
      backfillDays: PIPELINE.initialBackfillDays,
      limit: PIPELINE.maxPerRun,
    });
    console.log(`[pipeline] watermark=${watermark ?? "(backfill)"} ดึงใหม่ ${fresh.length} คอมเมนต์`);

    // 2) วิเคราะห์ + upsert (เฉพาะที่ใหม่)
    let analyzedCount = 0;
    let newWatermark: string | null = watermark;
    if (fresh.length) {
      let lastLogged = 0;
      const analyzed = await analyze(fresh, (d, t) => {
        if (d - lastLogged >= 200 || d === t) {
          lastLogged = d;
          console.log(`[pipeline] วิเคราะห์ ${d}/${t}`);
        }
      });
      analyzedCount = analyzed.length;
      const rows = analyzed.map(toRow);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await sb.from("comments").upsert(chunk, { onConflict: "comment_id" });
        if (error) throw new Error(`upsert comments ไม่สำเร็จ: ${error.message}`);
      }
      newWatermark = fresh.reduce<string | null>((max, c) => {
        if (c.created_at && (!max || c.created_at > max)) return c.created_at;
        return max;
      }, watermark);
    }

    // 3) คำนวณ summary จากหน้าต่างเวลา (อ่านจาก Supabase ไม่แตะ BigQuery)
    const windowComments = await loadWindow(sb, PIPELINE.windowDays);

    // 3.5–3.8) งานหนักจาก BigQuery (สินค้า/retention/GMV/อากาศ/พยากรณ์)
    //   ข้ามในโหมดเบา (ปุ่มบนเว็บ) เพื่อไม่ให้ request นานจน Render 502 — ให้ cron รายวันทำแทน
    if (!opts.light) {
      // 3.5) sync metadata สินค้า (ชื่อ/SKU/รูป/ราคา)
      try {
        await syncProducts(sb, await allProductIds(sb));
      } catch (e) {
        console.error("[pipeline] sync products ล้มเหลว (ข้ามไปก่อน):", e instanceof Error ? e.message : e);
      }
      // 3.6) sync Customer Retention (จาก shopee_orders)
      try {
        await syncRetention(sb);
      } catch (e) {
        console.error("[pipeline] sync retention ล้มเหลว (ข้ามไปก่อน):", e instanceof Error ? e.message : e);
      }
      // 3.7) sync ยอดขายรายวัน (Forecasting)
      try {
        await syncGmv(sb);
      } catch (e) {
        console.error("[pipeline] sync GMV ล้มเหลว (ข้ามไปก่อน):", e instanceof Error ? e.message : e);
      }
      // 3.8) sync ปัจจัยแวดล้อม + พยากรณ์สินค้า/สต๊อก
      try {
        await syncEnv(sb);
      } catch (e) {
        console.error("[pipeline] sync env ล้มเหลว (ข้ามไปก่อน):", e instanceof Error ? e.message : e);
      }
      try {
        await syncProductForecast(sb);
      } catch (e) {
        console.error("[pipeline] sync product forecast ล้มเหลว (ข้ามไปก่อน):", e instanceof Error ? e.message : e);
      }
    }

    const summary = aggregate(windowComments, PIPELINE.windowDays);

    // 4) บันทึก snapshot
    const { error: snapErr } = await sb
      .from("snapshots")
      .insert({ data: summary, window_days: PIPELINE.windowDays });
    if (snapErr) throw new Error(`บันทึก snapshot ไม่สำเร็จ: ${snapErr.message}`);

    // 5) อัปเดต daily_metrics ของวันนี้
    const today = new Date().toISOString().slice(0, 10);
    const brandsMap: Record<string, number> = {};
    for (const b of summary.brands) brandsMap[b.brand] = b.sentiment_score;
    const { error: dmErr } = await sb.from("daily_metrics").upsert(
      {
        date: today,
        overall_score: summary.overall.sentiment_score,
        total: summary.total_comments,
        urgent: summary.urgent_total,
        brands: brandsMap,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" }
    );
    if (dmErr) throw new Error(`อัปเดต daily_metrics ไม่สำเร็จ: ${dmErr.message}`);

    // 6) ปิด run log
    if (runId != null) {
      await sb
        .from("pipeline_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          fetched: fresh.length,
          analyzed: analyzedCount,
          watermark: newWatermark,
        })
        .eq("id", runId);
    }

    return {
      fetched: fresh.length,
      analyzed: analyzedCount,
      watermark: newWatermark,
      total_in_window: summary.total_comments,
      direction: summary.overall.direction,
      overall_score: summary.overall.sentiment_score,
      urgent_total: summary.urgent_total,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId != null) {
      await sb
        .from("pipeline_runs")
        .update({ finished_at: new Date().toISOString(), status: "error", message: msg })
        .eq("id", runId);
    }
    throw e;
  }
}
