"use client";
import { useMemo, useState } from "react";
import type { ReplyAgentStat, ReplyRecord } from "@/lib/db";
import { SentChip, ShopeeLink } from "./common";
import { Chat, Check, Search } from "./icons";
import ProductThumb from "./ProductThumb";

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

function StatusBadge({ status }: { status: string | null }) {
  if (status === "sent") return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pos bg-pos-bg px-2 py-0.5 rounded-full"><Check className="w-3 h-3" /> ส่งสำเร็จ</span>;
  if (status === "failed") return <span className="text-[11px] font-semibold text-neg bg-neg-bg px-2 py-0.5 rounded-full">ล้มเหลว</span>;
  return <span className="text-[11px] font-semibold text-muted bg-slate-100 px-2 py-0.5 rounded-full">ร่าง</span>;
}

export default function RepliesClient({ replies, stats }: { replies: ReplyRecord[]; stats: ReplyAgentStat[] }) {
  const [agent, setAgent] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    let r = replies;
    if (agent) r = r.filter((x) => (x.replied_by || "ไม่ระบุ") === agent);
    if (status) r = r.filter((x) => (x.status || "draft") === status);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) => (x.reply_text || "").toLowerCase().includes(t) || (x.comment_text || "").toLowerCase().includes(t) || (x.brand || "").toLowerCase().includes(t));
    }
    return r;
  }, [replies, agent, status, q]);

  const totalSent = stats.reduce((s, a) => s + a.sent, 0);
  const totalAll = stats.reduce((s, a) => s + a.total, 0);

  const inp = "border border-line rounded-lg px-2.5 py-2 text-sm bg-white";

  return (
    <div className="px-7 pt-5 pb-16 space-y-5 max-w-[1400px]">
      {/* สรุปรายแอดมิน */}
      <div>
        <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-3"><Chat className="w-4 h-4 text-shopee" /> สรุปการตอบกลับรายคน</h3>
        {stats.length === 0 ? (
          <div className="card card-pad text-sm text-muted">ยังไม่มีการตอบกลับจากทีม</div>
        ) : (
          <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[560px]:grid-cols-1">
            {stats.map((a) => {
              const active = agent === a.name;
              return (
                <button key={a.name} onClick={() => setAgent(active ? "" : a.name)}
                  className={`card card-pad text-left transition ${active ? "ring-2 ring-shopee" : "hover:border-shopee/40"}`}>
                  <div className="font-semibold text-ink truncate">{a.name}</div>
                  <div className="text-[26px] font-extrabold text-shopee leading-none mt-1">{a.total}</div>
                  <div className="text-[12px] text-muted mt-1">ตอบกลับทั้งหมด</div>
                  <div className="flex items-center gap-2 mt-2 text-[11.5px] flex-wrap">
                    <span className="text-pos font-semibold">สำเร็จ {a.sent}</span>
                    {a.failed > 0 && <span className="text-neg font-semibold">ล้มเหลว {a.failed}</span>}
                    {a.draft > 0 && <span className="text-muted">ร่าง {a.draft}</span>}
                  </div>
                  <div className="text-[11px] text-muted mt-1.5">ล่าสุด {fmtDate(a.last_at)}</div>
                </button>
              );
            })}
          </div>
        )}
        {totalAll > 0 && <p className="text-[12.5px] text-muted mt-2">รวมทั้งทีม {totalAll} ครั้ง • ส่งสำเร็จ {totalSent} ({Math.round((totalSent / totalAll) * 100)}%)</p>}
      </div>

      {/* ตัวกรอง */}
      <div className="flex items-center gap-2 flex-wrap">
        <select className={inp} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">ทุกคน</option>
          {stats.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
        <select className={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="sent">ส่งสำเร็จ</option>
          <option value="failed">ล้มเหลว</option>
          <option value="draft">ร่าง</option>
        </select>
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className={`${inp} w-full pl-8`} placeholder="ค้นหาคำตอบ / คอมเมนต์ / แบรนด์" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-[12.5px] text-muted ml-auto">{rows.length} รายการ</span>
      </div>

      {/* รายการ */}
      <div className="space-y-2.5">
        {rows.length === 0 && <div className="card card-pad text-center text-muted text-sm py-8">ไม่พบรายการตามเงื่อนไข</div>}
        {rows.map((r) => (
          <div key={r.comment_id} className="card card-pad">
            <div className="flex items-center gap-2 flex-wrap mb-2 text-[12px]">
              <span className="font-semibold text-ink">{r.replied_by || "ไม่ระบุ"}</span>
              <StatusBadge status={r.status} />
              {r.sentiment && <SentChip s={r.sentiment} />}
              {r.rating != null && <span className="text-muted">{r.rating}★</span>}
              <span className="text-muted ml-auto whitespace-nowrap">ตอบเมื่อ {fmtDate(r.updated_at)}</span>
            </div>
            <div className="flex items-center gap-2 mb-2 min-w-0">
              <ProductThumb src={r.product_image} size={36} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-ink truncate" title={r.product_item_name || undefined}>{r.product_item_name || r.brand || "-"}</div>
                <div className="text-[11px] text-muted truncate">{r.brand ? `${r.brand} • ` : ""}{r.product_name || ""}</div>
              </div>
            </div>
            {r.comment_text && (
              <div className="text-[12.5px] text-muted leading-snug border-l-2 border-line pl-2.5 mb-2">
                ลูกค้า: “{r.comment_text}”
                {r.created_at && <span className="block text-[11px] text-muted/80 mt-0.5">🕒 คอมเมนต์เมื่อ {fmtDate(r.created_at)}</span>}
              </div>
            )}
            <div className="text-[13.5px] text-ink leading-relaxed flex items-start gap-1.5">
              <Chat className="w-4 h-4 text-shopee flex-none mt-0.5" />
              <span>{r.reply_text}</span>
            </div>
            {r.status === "failed" && r.platform_response && (
              <div className="text-[11.5px] text-neg mt-1.5">เหตุผล: {r.platform_response}</div>
            )}
            <div className="mt-1.5"><ShopeeLink shopId={r.shop_id} itemId={r.product_name} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
