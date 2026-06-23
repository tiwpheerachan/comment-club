import { NextRequest, NextResponse } from "next/server";
import { fetchShopIds } from "@/lib/bigquery";
import { logActivity } from "@/lib/db";
import { replyConfigured, replyToShopee, REPLY_MAX_BATCH, REPLY_MAX_LEN, type ReplyItem } from "@/lib/shopee";
import { getServiceClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface InItem { comment_id: string | number; reply_text: string; shop_id?: number }

/**
 * ตอบกลับคอมเมนต์ Shopee จริง (ผ่าน datacenter proxy) + บันทึกผลลง Supabase
 * รองรับ 2 รูปแบบ body:
 *   เดี่ยว:  { comment_id, reply_text, replied_by?, shop_id? }
 *   หลายตัว: { items: [{ comment_id, reply_text, shop_id? }], replied_by? }
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const replied_by: string | null = raw.replied_by || null;
    const items: InItem[] = Array.isArray(raw.items)
      ? raw.items
      : [{ comment_id: raw.comment_id, reply_text: raw.reply_text, shop_id: raw.shop_id }];

    // ตรวจ input เบื้องต้น
    const norm = items
      .map((it) => ({ comment_id: String(it.comment_id ?? "").trim(), reply_text: String(it.reply_text ?? "").trim(), shop_id: Number(it.shop_id) || 0 }))
      .filter((it) => it.comment_id && it.reply_text);
    if (norm.length === 0) return NextResponse.json({ error: "ต้องมี comment_id และ reply_text" }, { status: 400 });
    if (norm.length > REPLY_MAX_BATCH) return NextResponse.json({ error: `ตอบได้ครั้งละไม่เกิน ${REPLY_MAX_BATCH} คอมเมนต์` }, { status: 400 });
    const tooLong = norm.find((it) => it.reply_text.length > REPLY_MAX_LEN);
    if (tooLong) return NextResponse.json({ error: `คำตอบยาวเกิน ${REPLY_MAX_LEN} ตัวอักษร (comment ${tooLong.comment_id})` }, { status: 400 });

    const sb = getServiceClient();
    if (!sb) return NextResponse.json({ error: "ยังไม่ได้เชื่อม Supabase" }, { status: 500 });

    // ผลรายตัว: comment_id → status + ข้อความ
    const result = new Map<string, { status: string; note: string | null }>();
    norm.forEach((it) => result.set(it.comment_id, { status: "draft", note: null }));

    if (!replyConfigured()) {
      // โหมดร่าง: ยังไม่ตั้ง API key → บันทึกอย่างเดียว
      norm.forEach((it) => result.set(it.comment_id, { status: "draft", note: "ยังไม่ตั้ง SHOPEE_REPLY_API_KEY → บันทึกร่างไว้ก่อน" }));
    } else {
      // เติม shop_id ที่ขาด ด้วยการ lookup จาก BigQuery (ทีเดียวทุกคอมเมนต์)
      const missing = norm.filter((it) => !it.shop_id).map((it) => it.comment_id);
      if (missing.length) {
        try {
          const map = await fetchShopIds(missing);
          norm.forEach((it) => { if (!it.shop_id) it.shop_id = map.get(it.comment_id) || 0; });
        } catch (e) {
          const m = "หา shop_id ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e));
          norm.forEach((it) => { if (!it.shop_id) result.set(it.comment_id, { status: "failed", note: m }); });
        }
      }

      // จัดกลุ่มตาม shop_id แล้วยิงเป็น batch ต่อร้าน
      const byShop = new Map<number, { comment_id: string; reply_text: string }[]>();
      for (const it of norm) {
        if (!it.shop_id) { result.set(it.comment_id, { status: "failed", note: result.get(it.comment_id)?.note || "ไม่พบ shop_id ของคอมเมนต์นี้" }); continue; }
        const arr = byShop.get(it.shop_id) || [];
        arr.push({ comment_id: it.comment_id, reply_text: it.reply_text });
        byShop.set(it.shop_id, arr);
      }

      for (const [shopId, group] of byShop) {
        const payload: ReplyItem[] = group.map((g) => ({ comment_id: Number(g.comment_id), comment: g.reply_text }));
        const outcome = await replyToShopee(shopId, payload);
        const acc = new Set(outcome.accepted.map(String));
        for (const g of group) {
          if (acc.has(g.comment_id)) {
            result.set(g.comment_id, { status: "sent", note: null });
          } else {
            result.set(g.comment_id, { status: "failed", note: outcome.error || "Shopee ไม่รับคำตอบ" });
          }
        }
      }
    }

    // บันทึกผลทุกคอมเมนต์
    const now = new Date().toISOString();
    await persist(sb, norm, result, replied_by, now);

    // สรุปผล
    const statuses = [...result.values()];
    const sent = statuses.filter((s) => s.status === "sent").length;
    const failed = statuses.filter((s) => s.status === "failed").length;
    const draft = statuses.filter((s) => s.status === "draft").length;
    const firstErr = statuses.find((s) => s.status === "failed")?.note;

    const single = norm.length === 1;
    let message: string;
    if (single) {
      const s = statuses[0];
      message = s.status === "sent" ? "ส่งคำตอบไป Shopee สำเร็จ"
        : s.status === "failed" ? "ส่งไม่สำเร็จ: " + (s.note || "")
        : "บันทึกร่างคำตอบแล้ว (ยังไม่ตั้ง API key)";
    } else {
      message = `ส่งสำเร็จ ${sent} • ล้มเหลว ${failed}${draft ? ` • ร่าง ${draft}` : ""}${firstErr ? ` (เช่น: ${firstErr})` : ""}`;
    }

    return NextResponse.json({
      ok: failed === 0,
      summary: { sent, failed, draft, total: norm.length },
      results: Object.fromEntries([...result.entries()].map(([k, v]) => [k, v.status])),
      message,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** เขียนผลลง comment_replies + comments + activity_log */
async function persist(
  sb: SupabaseClient,
  norm: { comment_id: string; reply_text: string }[],
  result: Map<string, { status: string; note: string | null }>,
  replied_by: string | null,
  now: string,
) {
  const replyRows = norm.map((it) => {
    const r = result.get(it.comment_id)!;
    return { comment_id: it.comment_id, reply_text: it.reply_text, status: r.status, replied_by, platform_response: r.note, updated_at: now };
  });
  await sb.from("comment_replies").upsert(replyRows, { onConflict: "comment_id" });

  // อัปเดตสถานะคอมเมนต์รายตัว (status ต่างกันได้)
  await Promise.all(norm.map((it) => {
    const r = result.get(it.comment_id)!;
    const patch: Record<string, unknown> = { note: it.reply_text };
    if (replied_by) patch.assignee = replied_by;
    patch.status = r.status === "sent" ? "resolved" : "in_progress";
    if (r.status === "sent") patch.handled_at = now;
    return sb.from("comments").update(patch).eq("comment_id", it.comment_id);
  }));

  await Promise.all(norm.map((it) => {
    const r = result.get(it.comment_id)!;
    return logActivity({
      actor: replied_by,
      action: r.status === "sent" ? "ตอบกลับ Shopee (สำเร็จ)" : r.status === "failed" ? "ตอบกลับ (ล้มเหลว)" : "บันทึกร่างคำตอบ",
      comment_id: it.comment_id,
      detail: it.reply_text.slice(0, 80),
    });
  }));
}
