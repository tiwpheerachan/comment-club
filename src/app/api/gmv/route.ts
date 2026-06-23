import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { getGmvDaily } from "@/lib/db";
import { canAccess } from "@/lib/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/gmv?scope=ALL|platform:Shopee|brand:vesync → ยอดขายรายวันของ scope นั้น */
export async function GET(req: NextRequest) {
  if (!canAccess(await getCurrentProfile(), "forecast")) return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  const scope = req.nextUrl.searchParams.get("scope") || "ALL";
  const rows = await getGmvDaily(scope);
  return NextResponse.json(rows);
}
