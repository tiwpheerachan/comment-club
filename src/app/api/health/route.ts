import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, supabase: hasSupabase() });
}
