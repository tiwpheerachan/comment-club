"use client";
import { useCallback, useEffect, useState } from "react";
import { getAdminName, getDefaultBrand } from "@/lib/admin";
import type { CommentRow } from "@/lib/db";
import { sevColors } from "@/lib/ui";
import { ShopeeLink } from "./common";
import { Chat, Star } from "./icons";
import ImageThumbs from "./ImageThumbs";
import ReplyBox from "./ReplyBox";

const TABS = [
 { key: "mine", label: "งานของฉัน" },
 { key: "new", label: "ยังไม่จัดการ" },
 { key: "in_progress", label: "กำลังจัดการ" },
 { key: "resolved", label: "จัดการแล้ว" },
 { key: "", label: "ทั้งหมด" },
];

export default function TriageClient({ brands = [], team = [] }: { brands?: string[]; team?: string[] }) {
 const [tab, setTab] = useState("new");
 const [brand, setBrand] = useState("");
 const [me, setMe] = useState("");
 const [rows, setRows] = useState<CommentRow[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<string | null>(null);

 useEffect(() => { setMe(getAdminName()); const d = getDefaultBrand(); if (d) setBrand(d); }, []);

 const load = useCallback(async () => {
 setLoading(true);
 const q = new URLSearchParams({ urgent: "1", sort: "severity_desc", pageSize: "100" });
 if (tab === "mine") q.set("assignee", me || "___none___");
 else if (tab) q.set("status", tab);
 if (brand) q.set("brand", brand);
 try {
 const res = await fetch("/api/comments?" + q.toString());
 const json = await res.json();
 setRows(json.rows ?? []);
 } catch {
 setRows([]);
 }
 setLoading(false);
 }, [tab, brand, me]);

 useEffect(() => { load(); }, [load]);

 async function patch(comment_id: string, fields: Record<string, string>) {
 setBusy(comment_id);
 try {
 await fetch("/api/triage", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment_id, actor: getAdminName() || null, ...fields }) });
 await load();
 } catch { alert("อัปเดตไม่สำเร็จ"); }
 setBusy(null);
 }

 const statusBadge = (s: string | null) => {
 const m: Record<string, [string, string, string]> = {
 new: ["#fdecec", "#dc2626", "ยังไม่จัดการ"], in_progress: ["#fdf3e3", "#b45309", "กำลังจัดการ"], resolved: ["#e8f7ee", "#16a34a", "จัดการแล้ว"],
 };
 const [bg, fg, label] = m[s ?? "new"] ?? m.new;
 return <span className="pill" style={{ background: bg, color: fg }}>{label}</span>;
 };

 // นับด่วนต่อแบรนด์ (จากที่โหลดมา)
 const byBrand = rows.reduce<Record<string, number>>((a, r) => { const b = r.brand || "ไม่ระบุ"; a[b] = (a[b] || 0) + 1; return a; }, {});

 return (
 <div className="p-7">
 <div className="flex gap-1.5 mb-3 flex-wrap items-center">
 {TABS.map((t) => (
 <button key={t.key} onClick={() => setTab(t.key)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border ${tab === t.key ? "bg-shopee text-white border-shopee" : "bg-white border-line text-ink hover:bg-gray-50"}`}>{t.label}</button>
 ))}
 <select value={brand} onChange={(e) => setBrand(e.target.value)} className="bg-white border border-line px-3 py-1.5 rounded-lg text-[13px] ml-auto">
 <option value="">ทุกแบรนด์</option>
 {brands.map((b) => <option key={b} value={b}>{b}</option>)}
 </select>
 </div>

 {/* สรุปด่วนรายแบรนด์ */}
 {!loading && rows.length > 0 && (
 <div className="flex gap-2 flex-wrap mb-4">
 {Object.entries(byBrand).sort((a, b) => b[1] - a[1]).map(([b, n]) => (
 <button key={b} onClick={() => setBrand(brand === b ? "" : (brands.includes(b) ? b : ""))} className={`text-[12px] px-2.5 py-1 rounded-full border ${brand === b ? "bg-neg text-white border-neg" : "bg-neg-bg text-neg border-transparent"}`}>
 {b} <b>{n}</b>
 </button>
 ))}
 </div>
 )}

 {loading ? (
 <div className="card card-pad text-center text-muted py-10">กำลังโหลด…</div>
 ) : rows.length === 0 ? (
 <div className="card card-pad text-center text-pos py-10">ไม่มีคอมเมนต์ในสถานะนี้ </div>
 ) : (
 <div className="space-y-3">
 {rows.map((r) => {
 const [bg, fg] = sevColors(r.severity ?? 0);
 return (
 <div key={r.comment_id} className="card card-pad">
 <div className="flex items-start gap-4">
 <span className="inline-flex items-center justify-center min-w-[34px] h-8 font-extrabold rounded-lg text-sm flex-none" style={{ background: bg, color: fg }}>{r.severity ?? 0}</span>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap mb-1">
 <b className="text-sm">{r.brand || "-"}</b>
 <span className="text-muted text-xs">{r.product_name || ""}</span>
 <span className="text-muted text-xs whitespace-nowrap">• {r.rating ?? "-"} <Star className="w-3 h-3 inline text-neu" /></span>
 <span className="chip !mb-0">{r.category || "-"}</span>
 {statusBadge(r.status)}
 {r.assignee && <span className="text-xs text-muted">ผู้รับผิดชอบ: {r.assignee}</span>}
 <ShopeeLink shopId={r.shop_id} itemId={r.product_name} className="ml-auto" />
 </div>
 <div className="text-[14px] text-ink leading-relaxed">“{r.comment_text}”</div>
 <ImageThumbs images={r.images} size={56} max={6} />
 {r.suggested_action && <div className="text-[12.5px] text-shopee mt-1.5">→ {r.suggested_action}</div>}
 {r.note && <div className="text-[12.5px] mt-2 p-2 rounded-lg bg-cc/5 border border-cc/20 text-ink flex items-start gap-1.5"><Chat className="w-4 h-4 text-cc flex-none mt-0.5" /><span>ตอบกลับแล้ว{r.assignee ? ` โดย ${r.assignee}` : ""}: {r.note}</span></div>}

 <div className="flex items-center gap-2 mt-3 flex-wrap">
 {r.status !== "in_progress" && <button disabled={busy === r.comment_id} onClick={() => patch(r.comment_id, { status: "in_progress", ...(getAdminName() ? { assignee: getAdminName() } : {}) })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neu-bg text-neu disabled:opacity-50">รับเรื่อง</button>}
 {r.status !== "resolved" && <button disabled={busy === r.comment_id} onClick={() => patch(r.comment_id, { status: "resolved", ...(getAdminName() ? { assignee: getAdminName() } : {}) })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-pos-bg text-pos disabled:opacity-50">ปิดงาน</button>}
 {r.status !== "new" && <button disabled={busy === r.comment_id} onClick={() => patch(r.comment_id, { status: "new" })} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-ink disabled:opacity-50">กลับเป็นยังไม่จัดการ</button>}
 <select value={r.assignee ?? ""} onChange={(e) => patch(r.comment_id, { assignee: e.target.value })} className="bg-white border border-line px-2.5 py-1.5 rounded-lg text-xs" title="มอบหมาย/ส่งต่อให้">
 <option value="">มอบหมายให้…</option>
 {[...new Set([...team, ...(r.assignee && !team.includes(r.assignee) ? [r.assignee] : [])])].map((m) => <option key={m} value={m}>{m}</option>)}
 </select>
 </div>

 <ReplyBox comment={r} onSent={load} />
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

