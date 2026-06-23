import { getServiceClient } from "./supabase";
import { createSupabaseServer } from "./supabase/server";

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  role: "super_admin" | "admin" | "staff" | string;
  allowed_brands: string[];
  allowed_pages: string[];
  active: boolean;
}

/** โปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่ (จาก session) */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = getServiceClient();
  const fallback: Profile = { id: user.id, email: user.email ?? null, name: user.email ?? null, role: "staff", allowed_brands: [], allowed_pages: [], active: true };
  if (!svc) return fallback;
  const { data } = await svc.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (data as Profile) ?? fallback;
}

/** แบรนด์ที่ผู้ใช้มีสิทธิ์เห็น — null = ทุกแบรนด์ (super_admin/admin หรือไม่จำกัด) */
export function allowedBrandsOf(p: Profile | null): string[] | null {
  if (!p) return null;
  if (p.role === "super_admin" || p.role === "admin") return null;
  return p.allowed_brands && p.allowed_brands.length ? p.allowed_brands : null;
}

export const isSuperAdmin = (p: Profile | null) => p?.role === "super_admin";
