import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard() {
  const me = await getCurrentProfile();
  if (me?.role !== "super_admin") return null;
  return getServiceClient();
}

export async function GET() {
  const sb = await guard();
  if (!sb) return NextResponse.json({ error: "ต้องเป็น super admin" }, { status: 403 });
  const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const sb = await guard();
  if (!sb) return NextResponse.json({ error: "ต้องเป็น super admin" }, { status: 403 });
  try {
    const { email, password, name, role, allowed_brands, allowed_pages } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "ต้องมีอีเมลและรหัสผ่าน" }, { status: 400 });
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await sb.from("profiles").upsert({
      id: data.user.id, email, name: name || email, role: role || "staff",
      allowed_brands: Array.isArray(allowed_brands) ? allowed_brands : [],
      allowed_pages: Array.isArray(allowed_pages) ? allowed_pages : [], active: true,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const sb = await guard();
  if (!sb) return NextResponse.json({ error: "ต้องเป็น super admin" }, { status: 403 });
  try {
    const { id, name, role, allowed_brands, allowed_pages, active, password, avatar_url } = await req.json();
    if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (name !== undefined) patch.name = name;
    if (role !== undefined) patch.role = role;
    if (allowed_brands !== undefined) patch.allowed_brands = allowed_brands;
    if (allowed_pages !== undefined) patch.allowed_pages = allowed_pages;
    if (active !== undefined) patch.active = active;
    if (avatar_url !== undefined) patch.avatar_url = avatar_url;
    if (Object.keys(patch).length) await sb.from("profiles").update(patch).eq("id", id);
    if (password) {
      const { error } = await sb.auth.admin.updateUserById(id, { password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const sb = await guard();
  if (!sb) return NextResponse.json({ error: "ต้องเป็น super admin" }, { status: 403 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ต้องมี id" }, { status: 400 });
    const me = await getCurrentProfile();
    if (me?.id === id) return NextResponse.json({ error: "ลบบัญชีตัวเองไม่ได้" }, { status: 400 });
    const { error } = await sb.auth.admin.deleteUser(id); // profile ลบตาม FK on delete cascade
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
