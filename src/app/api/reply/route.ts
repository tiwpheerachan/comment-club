import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ตอบกลับคอมเมนต์ → (เผื่ออนาคต) ส่งไป Shopee API
 * ตอนนี้: บันทึกร่าง/ประวัติลง Supabase. ถ้าตั้งค่า Shopee API ครบ จะยิงจริง (TODO)
 *
 * วิธีต่อ Shopee จริง (เมื่อได้ข้อมูล): ใช้ Shopee Open API endpoint
 *   POST /api/v2/product/reply_comment  (ต้องมี partner_id, shop_id, access_token, sign)
 *   ใส่ env: SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_SHOP_ID, SHOPEE_ACCESS_TOKEN
 *   แล้วเติมโค้ดในบล็อก "ส่งจริง" ด้านล่าง
 */
export async function POST(req: NextRequest) {
  try {
    const { comment_id, reply_text, replied_by } = await req.json();
    if (!comment_id || !reply_text?.trim()) {
      return NextResponse.json({ error: "ต้องมี comment_id และ reply_text" }, { status: 400 });
    }
    const sb = getServiceClient();
    if (!sb) return NextResponse.json({ error: "ยังไม่ได้เชื่อม Supabase" }, { status: 500 });

    const shopeeReady = Boolean(
      process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY && process.env.SHOPEE_SHOP_ID && process.env.SHOPEE_ACCESS_TOKEN
    );

    let status = "draft";
    let platformResponse: string | null = null;

    if (shopeeReady) {
      // ── ส่งจริงไป Shopee (เติมเมื่อได้ข้อมูล API) ──
      // const res = await fetch("https://partner.shopeemobile.com/api/v2/product/reply_comment", { ... });
      // status = res.ok ? "sent" : "failed"; platformResponse = await res.text();
      status = "draft";
      platformResponse = "Shopee API config พบแล้ว แต่ยังไม่ได้ implement การส่ง (รอข้อมูล endpoint/scope)";
    }

    const now = new Date().toISOString();
    const { error } = await sb.from("comment_replies").upsert(
      { comment_id: String(comment_id), reply_text, status, replied_by: replied_by || null, platform_response: platformResponse, updated_at: now },
      { onConflict: "comment_id" }
    );
    if (error) throw new Error(error.message);

    // เก็บข้อความตอบ + ชื่อผู้ตอบ ไว้ที่คอมเมนต์ + ทำเครื่องหมายกำลังจัดการ
    const patch: Record<string, unknown> = { note: reply_text, status: "in_progress" };
    if (replied_by) patch.assignee = replied_by;
    await sb.from("comments").update(patch).eq("comment_id", String(comment_id));

    return NextResponse.json({
      ok: true,
      status,
      message: shopeeReady ? "บันทึกแล้ว (Shopee API พร้อมต่อ — ยังไม่ส่งจริง)" : "บันทึกร่างคำตอบแล้ว ✓ (ยังไม่เชื่อม Shopee API — ส่งจริงได้เมื่อใส่ API key)",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
