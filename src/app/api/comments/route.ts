import { NextRequest, NextResponse } from "next/server";
import { allowedBrandsOf, getCurrentProfile } from "@/lib/auth";
import { listComments } from "@/lib/db";
import { parseFilters } from "@/lib/parseFilters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);
    const allowed = allowedBrandsOf(await getCurrentProfile());
    if (allowed) {
      if (filters.brand && !allowed.includes(filters.brand)) return NextResponse.json({ rows: [], total: 0 });
      filters.brandsIn = allowed;
    }
    const result = await listComments(filters);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
