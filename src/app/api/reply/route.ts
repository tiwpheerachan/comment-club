import { NextRequest, NextResponse } from "next/server";
import { fetchShopIds } from "@/lib/bigquery";
import { logActivity } from "@/lib/db";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_URL = process.env.SHOPEE_REPLY_API_URL || "https://ecom-data-platform.onrender.com/api/shopee/reply-comment";
const API_KEY = process.env.SHOPEE_REPLY_API_KEY;

/**
 * ตอบกลับคอมเมนต์ → ยิงจริงไป Shopee ผ่าน ecom-data-platform proxy
 * body: { comment_id, reply_text, replied_by?, shop_id? }
 */
export async function POST(req: NextRequest) {
  try {
    const { comment_id, reply_text, replied_by, shop_id: shopIdIn } = await req.json();
    if (!comment_id || !reply_text?.trim()) return NextResponse.json({ error: "ต้องมี comment_id และ reply_text" }, { status: 400 });
    const text = String(reply_text).trim();
    if (text.length > 500) return NextResponse.json({ error: "คำตอบยาวเกิน 500 ตัวอักษร" }, { status: 400 });

    const sb = getServiceClient();
    if (!sb) return NextResponse.json({ error: "ยังไม่ได้เชื่อม Supabase" }, { status: 500 });

    let status = "draft";
    let platformResponse: string | null = null;

    if (API_KEY) {
      // หา shop_id (จาก body หรือ lookup จาก BigQuery ด้วย comment_id)
      let shopId = Number(shopIdIn) || 0;
      if (!shopId) {
        try {
          const map = await fetchShopIds([String(comment_id)]);
          shopId = map.get(String(comment_id)) || 0;
        } catch (e) {
          platformResponse = "หา shop_id ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e));
        }
      }
      if (shopId) {
        try {
          const res = await fetch(API_URL, {
            method: "POST",
            headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ shop_id: shopId, comment_list: [{ comment_id: Number(comment_id), comment: text }] }),
          });
          platformResponse = (await res.text()).slice(0, 1000);
          status = res.ok ? "sent" : "failed";
        } catch (e) {
          status = "failed";
          platformResponse = "เรียก Shopee API ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e));
        }
      } else {
        status = "failed";
        platformResponse = platformResponse || "ไม่พบ shop_id ของคอมเมนต์นี้";
      }
    } else {
      platformResponse = "ยังไม่ตั้ง SHOPEE_REPLY_API_KEY → บันทึกร่างไว้ก่อน";
    }

    const now = new Date().toISOString();
    await sb.from("comment_replies").upsert(
      { comment_id: String(comment_id), reply_text: text, status, replied_by: replied_by || null, platform_response: platformResponse, updated_at: now },
      { onConflict: "comment_id" }
    );
    const patch: Record<string, unknown> = { note: text };
    if (replied_by) patch.assignee = replied_by;
    patch.status = status === "sent" ? "resolved" : "in_progress";
    if (status === "sent") patch.handled_at = now;
    await sb.from("comments").update(patch).eq("comment_id", String(comment_id));

    await logActivity({ actor: replied_by, action: status === "sent" ? "ตอบกลับ Shopee (สำเร็จ)" : status === "failed" ? "ตอบกลับ (ล้มเหลว)" : "บันทึกร่างคำตอบ", comment_id: String(comment_id), detail: text.slice(0, 80) });

    const message =
      status === "sent" ? "ส่งคำตอบไป Shopee สำเร็จ ✓"
      : status === "failed" ? "ส่งไม่สำเร็จ: " + (platformResponse || "")
      : "บันทึกร่างคำตอบแล้ว (ยังไม่ตั้ง API key)";
    return NextResponse.json({ ok: status !== "failed", status, message });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
