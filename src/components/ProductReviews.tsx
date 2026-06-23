"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommentRow } from "@/lib/db";
import { sevColors } from "@/lib/ui";
import { SellerReplyBadge, SentChip, ShopeeLink } from "./common";
import { Search, Star } from "./icons";
import ImageThumbs from "./ImageThumbs";
import ReplyBox from "./ReplyBox";

type Tab = "all" | "negative" | "positive" | "urgent" | "withimg";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "negative", label: "เชิงลบ" },
  { key: "positive", label: "เชิงบวก" },
  { key: "urgent", label: "ด่วน" },
  { key: "withimg", label: "มีรูป" },
];

export default function ProductReviews({ comments }: { comments: CommentRow[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    let r = comments;
    if (tab === "negative") r = r.filter((c) => c.sentiment === "negative");
    else if (tab === "positive") r = r.filter((c) => c.sentiment === "positive");
    else if (tab === "urgent") r = r.filter((c) => c.urgent);
    else if (tab === "withimg") r = r.filter((c) => (c.images?.length ?? 0) > 0);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((c) => (c.comment_text || "").toLowerCase().includes(t));
    }
    return r;
  }, [comments, tab, q]);

  const count = (t: Tab) => {
    if (t === "all") return comments.length;
    if (t === "negative") return comments.filter((c) => c.sentiment === "negative").length;
    if (t === "positive") return comments.filter((c) => c.sentiment === "positive").length;
    if (t === "urgent") return comments.filter((c) => c.urgent).length;
    return comments.filter((c) => (c.images?.length ?? 0) > 0).length;
  };

  return (
    <div>
      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <div className="flex gap-1.5 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                tab === t.key ? "bg-shopee text-white border-shopee" : "bg-white border-line text-ink hover:bg-slate-50"
              }`}
            >
              {t.label} <span className="opacity-70">{count(t.key)}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นในรีวิว…"
            className="bg-white border border-line pl-8 pr-3 py-2 rounded-lg text-[13px] w-[220px]"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.length === 0 && <div className="card card-pad text-center text-muted text-sm py-8">ไม่พบรีวิวตามเงื่อนไข</div>}
        {rows.map((r) => {
          const [bg, fg] = sevColors(r.severity ?? 0);
          return (
            <div key={r.comment_id} className="card card-pad">
              <div className="flex items-center gap-2 flex-wrap mb-1.5 text-[12px]">
                <span className="font-semibold text-[13px] text-ink">{r.username || "ผู้ใช้"}</span>
                <span className="text-neu whitespace-nowrap">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-3 h-3 inline ${i < Math.round(r.rating ?? 0) ? "text-neu" : "text-slate-200"}`} />
                  ))}
                </span>
                <SentChip s={r.sentiment} />
                <span className="chip !mb-0 !mr-0">{r.category || "-"}</span>
                {r.urgent && (
                  <span className="inline-flex items-center gap-1 font-bold px-1.5 py-0.5 rounded text-[11px]" style={{ background: bg, color: fg }}>
                    ด่วน {r.severity}
                  </span>
                )}
                <span className="text-muted ml-auto">
                  {r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : ""}
                </span>
              </div>
              <div className="text-[14px] text-ink leading-relaxed">{r.comment_text}</div>
              <ImageThumbs images={r.images} size={56} max={8} />
              {r.suggested_action && <div className="text-[12.5px] text-shopee mt-1.5">→ {r.suggested_action}</div>}
              <SellerReplyBadge reply={r.seller_reply} at={r.seller_reply_at} hidden={r.seller_reply_hidden} />
              {r.note && (
                <div className="text-[12.5px] mt-2 p-2 rounded-lg bg-pos-bg/60 border border-pos/20 text-ink">
                  ตอบแล้ว{r.assignee ? ` โดย ${r.assignee}` : ""}: {r.note}
                </div>
              )}
              <div className="mt-1.5"><ShopeeLink shopId={r.shop_id} itemId={r.product_name} /></div>
              <ReplyBox comment={r} onSent={() => router.refresh()} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
