import { NextRequest, NextResponse } from "next/server";
import { updateTriage } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { comment_id, status, assignee, note } = body ?? {};
    if (!comment_id) return NextResponse.json({ error: "ต้องระบุ comment_id" }, { status: 400 });
    const allowed = ["new", "in_progress", "resolved"];
    if (status && !allowed.includes(status)) {
      return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
    }
    await updateTriage(comment_id, { status, assignee, note });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
