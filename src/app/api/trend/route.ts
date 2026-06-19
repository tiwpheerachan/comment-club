import { NextResponse } from "next/server";
import { getTrend } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const trend = await getTrend();
  return NextResponse.json(trend);
}
