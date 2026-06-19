import { NextRequest, NextResponse } from "next/server";
import { logActivity, updateTriage } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { new: "กลับเป็นยังไม่จัดการ", in_progress: "รับเรื่อง", resolved: "ปิดงาน (จัดการแล้ว)" };

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { comment_id, status, assignee, note, actor } = body ?? {};
    if (!comment_id) return NextResponse.json({ error: "ต้องระบุ comment_id" }, { status: 400 });
    const allowed = ["new", "in_progress", "resolved"];
    if (status && !allowed.includes(status)) {
      return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
    }
    await updateTriage(comment_id, { status, assignee, note });

    // บันทึกกิจกรรม (ใครทำอะไร)
    if (status) await logActivity({ actor, action: STATUS_LABEL[status] || status, comment_id, detail: assignee ? `→ ${assignee}` : null });
    else if (assignee) await logActivity({ actor, action: "มอบหมายงาน", comment_id, detail: `ให้ ${assignee}` });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
