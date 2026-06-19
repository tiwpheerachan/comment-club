// ชั้นอ่านข้อมูลให้ dashboard — อ่านจาก Supabase (ข้อมูลที่ pipeline ดึงจาก BigQuery มาพักไว้)
import { getServiceClient, hasSupabase } from "./supabase";
import type { Summary, TrendPoint } from "./types";

export async function getSummary(): Promise<{ summary: Summary | null; configured: boolean }> {
  const sb = getServiceClient();
  if (!sb) return { summary: null, configured: false };

  const { data, error } = await sb
    .from("snapshots")
    .select("data")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.data) return { summary: null, configured: true };
  return { summary: data.data as Summary, configured: true };
}

export async function getTrend(): Promise<TrendPoint[]> {
  const sb = getServiceClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("daily_metrics")
    .select("date, overall_score, total, urgent, brands")
    .order("date", { ascending: true })
    .limit(90);
  if (error || !data) return [];
  return data.map((r) => ({
    date: String(r.date),
    overall_score: Number(r.overall_score),
    total: Number(r.total),
    urgent: Number(r.urgent),
    brands: (r.brands as Record<string, number>) || {},
  }));
}

export { hasSupabase };
