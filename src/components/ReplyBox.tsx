"use client";
import { useState } from "react";
import { getAdminName } from "@/lib/admin";
import type { CommentRow } from "@/lib/db";
import { suggestReply } from "@/lib/reply";
import { Chat } from "./icons";

const REPLY_MAX = 500;

type ReplyTarget = Pick<CommentRow, "comment_id" | "category" | "sentiment" | "urgent" | "seller_reply">;

/**
 * กล่องร่าง+ส่งคำตอบไป Shopee — ใช้ได้ทุกหน้า (ทั้งคอมเมนต์บวก/ลบ/ด่วน)
 * ตอบกลับสำเร็จ → comment ถูกตั้ง resolved (เก็บใน comment_replies + comments.note)
 */
export default function ReplyBox({ comment, onSent, openLabel = "ตอบกลับคอมเมนต์" }: { comment: ReplyTarget; onSent?: () => void; openLabel?: string }) {
  const alreadyReplied = Boolean(comment.seller_reply);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => suggestReply({ category: comment.category, sentiment: comment.sentiment, urgent: comment.urgent, seed: comment.comment_id }));
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sending, setSending] = useState(false);

  const len = text.trim().length;
  const over = len > REPLY_MAX;
  const empty = len === 0;

  async function send() {
    if (over || empty) return;
    setSending(true); setMsg(null);
    try {
      const res = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: comment.comment_id, reply_text: text, replied_by: getAdminName() || null }),
      });
      // อ่านแบบทนทาน: ถ้า response ไม่ใช่ JSON (เช่นหน้า 502 ของ Render) จะไม่โยน error ลึกลับ
      const j = await res.json().catch(() => ({} as { ok?: boolean; message?: string; error?: string }));
      const ok = res.ok && j.ok !== false;
      setMsg({ text: ok ? (j.message || "ส่งสำเร็จ") : (j.message || "ผิดพลาด: " + (j.error || `เซิร์ฟเวอร์ตอบ HTTP ${res.status}`)), ok });
      if (ok) setTimeout(() => onSent?.(), 900);
    } catch (e) { setMsg({ text: "ผิดพลาด: " + (e instanceof Error ? e.message : e), ok: false }); }
    setSending(false);
  }

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-shopee hover:underline">
        <Chat className="w-3.5 h-3.5" /> {open ? "ซ่อนคำตอบ" : alreadyReplied ? "ตอบเพิ่ม/แก้คำตอบ" : openLabel}
      </button>
      {open && (
        <div className="mt-2 border border-line rounded-xl p-3 bg-slate-50/60">
          {alreadyReplied && (
            <div className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
              คอมเมนต์นี้มีคำตอบจากผู้ขายอยู่แล้วบน Shopee — การส่งใหม่จะเป็นการตอบ/แก้ทับ
            </div>
          )}
          <div className="text-[11px] text-muted mb-1.5">ร่างอัตโนมัติ (แก้ไขได้) — ปรับให้เหมาะแล้วกดส่งไป Shopee</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`w-full bg-white border rounded-lg p-2.5 text-[13px] leading-relaxed ${over ? "border-neg" : "border-line"}`} />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[11px] ${over ? "text-neg font-semibold" : "text-muted"}`}>{len}/{REPLY_MAX} ตัวอักษร{over ? " — ยาวเกินกำหนด" : ""}</span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <button onClick={send} disabled={sending || over || empty} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-shopee text-white disabled:opacity-50">{sending ? "กำลังส่ง…" : "ส่งไป Shopee"}</button>
            <button onClick={() => navigator.clipboard?.writeText(text)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-line">คัดลอก</button>
            <button onClick={() => setText(suggestReply({ category: comment.category, sentiment: comment.sentiment, urgent: comment.urgent, seed: comment.comment_id }))} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-line text-muted">รีเซ็ตร่าง</button>
            {msg && <span className={`text-[12px] font-medium ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
