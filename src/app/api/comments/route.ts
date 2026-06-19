import { NextRequest, NextResponse } from "next/server";
import { listComments } from "@/lib/db";
import { parseFilters } from "@/lib/parseFilters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const result = await listComments(parseFilters(req.nextUrl.searchParams));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
