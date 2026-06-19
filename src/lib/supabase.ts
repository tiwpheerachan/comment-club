import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

/**
 * client ฝั่ง server ใช้ service-role key (ข้าม RLS) — ใช้เฉพาะใน pipeline / API route
 * คืน null ถ้ายังไม่ตั้ง env (ให้ระบบ fallback ไป mock data ได้ตอน dev)
 */
export function getServiceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !key) return null;
  return createClient(URL, key, {
    auth: { persistSession: false },
  });
}

export function hasSupabase(): boolean {
  return Boolean(URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
