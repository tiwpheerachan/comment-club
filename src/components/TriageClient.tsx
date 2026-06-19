"use client";
import { useCallback, useEffect, useState } from "react";
import type { CommentRow } from "@/lib/db";
import { sevColors } from "@/lib/ui";
import { Star } from "./icons";
import ImageThumbs from "./ImageThumbs";

const TABS = [
  { key: "new", label: "ยังไม่จัดการ" },
  { key: "in_progress", label: "กำลังจัดการ" },
  { key: "resolved", label: "จัดการแล้ว" },
  { key: "", label: "ทั้งหมด" },
];

export default function TriageClient() {
  const [tab, setTab] = useState("new");
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ urgent: "1", sort: "severity_desc", pageSize: "100" });
    if (tab) q.set("status", tab);
    try {
      const res = await fetch("/api/comments?" + q.toString());
      const json = await res.json();
      setRows(json.rows ?? []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(comment_id: string, fields: Record<string, string>) {
    setBusy(comment_id);
    try {
      await fetch("/api/triage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id, ...fields }),
      });
      await load();
    } catch {
      alert("อัปเดตไม่สำเร็จ");
    }
    setBusy(null);
  }

  const statusBadge = (s: string | null) => {
    const m: Record<string, [string, string, string]> = {
      new: ["#fdecec", "#dc2626", "ยังไม่จัดการ"],
      in_progress: ["#fdf3e3", "#b45309", "กำลังจัดการ"],
      resolved: ["#e8f7ee", "#16a34a", "จัดการแล้ว"],
    };
    const [bg, fg, label] = m[s ?? "new"] ?? m.new;
    return (
      <span className="pill" style={{ background: bg, color: fg }}>
        {label}
      </span>
    );
  };

  return (
    <div className="p-7">
      <div className="flex gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border ${
              tab === t.key ? "bg-shopee text-white border-shopee" : "bg-white border-line text-ink hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card card-pad text-center text-muted py-10">กำลังโหลด…</div>
      ) : rows.length === 0 ? (
        <div className="card card-pad text-center text-pos py-10">ไม่มีคอมเมนต์ในสถานะนี้ 🎉</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const [bg, fg] = sevColors(r.severity ?? 0);
            return (
              <div key={r.comment_id} className="card card-pad">
                <div className="flex items-start gap-4">
                  <span
                    className="inline-flex items-center justify-center min-w-[34px] h-8 font-extrabold rounded-lg text-sm flex-none"
                    style={{ background: bg, color: fg }}
                  >
                    {r.severity ?? 0}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <b className="text-sm">{r.brand || "-"}</b>
                      <span className="text-muted text-xs">{r.product_name || ""}</span>
                      <span className="text-muted text-xs whitespace-nowrap">
                        • {r.rating ?? "-"} <Star className="w-3 h-3 inline text-neu" />
                      </span>
                      <span className="chip !mb-0">{r.category || "-"}</span>
                      {statusBadge(r.status)}
                      {r.assignee && <span className="text-xs text-muted">ผู้รับผิดชอบ: {r.assignee}</span>}
                    </div>
                    <div className="text-[14px] text-ink leading-relaxed">“{r.comment_text}”</div>
                    <ImageThumbs images={r.images} size={56} max={6} />
                    {r.suggested_action && (
                      <div className="text-[12.5px] text-shopee mt-1.5">→ {r.suggested_action}</div>
                    )}

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {r.status !== "in_progress" && (
                        <button
                          disabled={busy === r.comment_id}
                          onClick={() => patch(r.comment_id, { status: "in_progress" })}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neu-bg text-neu disabled:opacity-50"
                        >
                          รับเรื่อง
                        </button>
                      )}
                      {r.status !== "resolved" && (
                        <button
                          disabled={busy === r.comment_id}
                          onClick={() => patch(r.comment_id, { status: "resolved" })}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pos-bg text-pos disabled:opacity-50"
                        >
                          ปิดงาน (จัดการแล้ว)
                        </button>
                      )}
                      {r.status !== "new" && (
                        <button
                          disabled={busy === r.comment_id}
                          onClick={() => patch(r.comment_id, { status: "new" })}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-ink disabled:opacity-50"
                        >
                          กลับเป็นยังไม่จัดการ
                        </button>
                      )}
                      <input
                        defaultValue={r.assignee ?? ""}
                        placeholder="มอบหมายให้… (กด Enter)"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") patch(r.comment_id, { assignee: (e.target as HTMLInputElement).value });
                        }}
                        className="bg-white border border-line px-2.5 py-1.5 rounded-lg text-xs w-[200px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
