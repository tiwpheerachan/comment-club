import { NextRequest, NextResponse } from "next/server";
import { PIPELINE_SECRET } from "@/lib/config";
import { runPipeline } from "@/lib/pipeline";

// pipeline เรียก BigQuery/Anthropic — ต้องรันบน Node runtime และอาจใช้เวลานาน
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * อนุญาตเมื่อ:
 *  - ไม่ได้ตั้ง PIPELINE_SECRET (โหมด dev) หรือ
 *  - แนบ secret ถูกต้อง (Authorization: Bearer / x-pipeline-secret / ?key=) สำหรับ cron ภายนอก หรือ
 *  - เป็นคำขอ same-origin (ปุ่ม "ดึง+วิเคราะห์ใหม่" บน dashboard)
 */
function authorized(req: NextRequest): boolean {
  if (!PIPELINE_SECRET) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const headerKey = req.headers.get("x-pipeline-secret");
  const queryKey = req.nextUrl.searchParams.get("key");
  if ([bearer, headerKey, queryKey].includes(PIPELINE_SECRET)) return true;

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPipeline();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/pipeline]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// รองรับ cron ที่ยิงแบบ GET (Render Cron / Vercel Cron / GitHub Action)
export async function GET(req: NextRequest) {
  return handle(req);
}
