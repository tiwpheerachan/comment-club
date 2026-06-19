import { NextRequest } from "next/server";
import { allowedBrandsOf, getCurrentProfile } from "@/lib/auth";
import { listComments } from "@/lib/db";
import { parseFilters } from "@/lib/parseFilters";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

export async function GET(req: NextRequest) {
  const f = parseFilters(req.nextUrl.searchParams);
  const allowed = allowedBrandsOf(await getCurrentProfile());
  if (allowed) f.brandsIn = allowed;
  f.pageSize = 200;
  const cols = [
    "comment_id", "created_at", "brand", "product_name", "rating", "sentiment",
    "category", "severity", "urgent", "status", "comment_text", "summary", "suggested_action",
  ] as const;

  // ดึงทุกหน้าจนครบ (จำกัดที่ 10,000 แถวกันหนักเกิน)
  const lines: string[] = [cols.join(",")];
  let page = 1;
  let fetched = 0;
  for (;;) {
    const { rows, total } = await listComments({ ...f, page });
    for (const r of rows) {
      lines.push(cols.map((c) => csvCell((r as unknown as Record<string, unknown>)[c])).join(","));
    }
    fetched += rows.length;
    if (rows.length === 0 || fetched >= total || fetched >= 10000) break;
    page++;
  }

  const csv = "﻿" + lines.join("\n"); // BOM ให้ Excel อ่านภาษาไทยได้
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shopee-comments.csv"`,
    },
  });
}
