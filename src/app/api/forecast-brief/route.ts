import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { generateForecastBrief, type BriefInput } from "@/lib/forecast-ai";
import { canAccess } from "@/lib/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/forecast-brief
 * body: { kind: "product"|"sales", title: string, facts: object }
 * → บทวิเคราะห์พยากรณ์ (markdown ภาษาไทย) จาก Claude
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  // ใช้สิทธิ์ stock สำหรับสินค้า, forecast สำหรับยอดขายรวม
  let body: BriefInput;
  try {
    body = (await req.json()) as BriefInput;
  } catch {
    return NextResponse.json({ ok: false, error: "body ไม่ถูกต้อง" }, { status: 400 });
  }
  const need = body.kind === "sales" ? "forecast" : "stock";
  if (!canAccess(profile, need)) return NextResponse.json({ ok: false, error: "ไม่มีสิทธิ์" }, { status: 403 });
  if (!body || !body.facts || !body.title) return NextResponse.json({ ok: false, error: "ต้องมี title และ facts" }, { status: 400 });

  const result = await generateForecastBrief({ kind: body.kind === "sales" ? "sales" : "product", title: String(body.title).slice(0, 200), facts: body.facts });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
