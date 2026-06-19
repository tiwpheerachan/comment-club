import { NextResponse } from "next/server";
import { getSummary } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const { summary, configured } = await getSummary();
  if (!summary) {
    return NextResponse.json(
      { error: configured ? "ยังไม่มี snapshot — รัน pipeline ก่อน" : "ยังไม่ได้เชื่อม Supabase" },
      { status: 404 }
    );
  }
  return NextResponse.json(summary);
}
