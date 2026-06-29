"use client";
import { useCallback, useEffect, useState } from "react";
import { getAdminName, getDefaultBrand } from "@/lib/admin";
import type { CommentRow } from "@/lib/db";
import { fmtDateTime, fmtRelative, sevColors } from "@/lib/ui";
import { SellerReplyBadge, ShopeeLink } from "./common";
import { Chat, Star } from "./icons";
import Avatar from "./Avatar";
import ImageThumbs from "./ImageThumbs";
import ProductThumb from "./ProductThumb";
import ReplyBox from "./ReplyBox";

const TABS = [
 { key: "mine", label: "งานของฉัน" },
 { key: "new", label: "ยังไม่จัดการ" },
 { key: "in_progress", label: "กำลังจัดการ" },
 { key: "resolved", label: "จัดการแล้ว" },
 { key: "", label: "ทั้งหมด" },
];

const SORTS = [
 { key: "smart", label: "ฉลาด (ด่วน+ใหม่ก่อน)", api: "severity_desc" },
 { key: "new_old", label: "วันที่ใหม่→เก่า", api: "created_desc" },
 { key: "old_new", label: "วันที่เก่า→ใหม่", api: "created_asc" },
 { key: "severe", label: "รุนแรงสุด", api: "severity_desc" },
 { key: "rating", label: "คะแนนต่ำสุด", api: "rating_asc" },
] as const;

const SENTIMENTS = [
 { key: "", label: "ทุกอารมณ์" },
 { key: "negative", label: "เชิงลบ" },
 { key: "neutral", label: "กลาง" },
 { key: "positive", label: "เชิงบวก" },
];

export default function TriageClient({ brands = [], users = [] }: { brands?: string[]; users?: { name: string; avatar: string | null }[] }) {
 const team = users.map((u) => u.name);
 const userAvatar = new Map(users.map((u) => [u.name, u.avatar]));
 const [tab, setTab] = useState("new");
 const [brand, setBrand] = useState("");
 const [me, setMe] = useState("");
 const [sort, setSort] = useState<string>("smart");
 const [sentiment, setSentiment] = useState("");
 const [q, setQ] = useState("");
 const [qDebounced, setQDebounced] = useState("");
 const [urgentOnly, setUrgentOnly] = useState(true);
 const [rows, setRows] = useState<CommentRow[]>([]);
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState<string | null>(null);

 useEffect(() => { setMe(getAdminName()); const d = getDefaultBrand(); if (d) setBrand(d); }, []);
 // debounce ช่องค้นหา
 useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 350); return () => clearTimeout(t); }, [q]);

 const load = useCallback(async () => {
 setLoading(true);
 const apiSort = SORTS.find((s) => s.key === sort)?.api ?? "severity_desc";
 const params = new URLSearchParams({ sort: apiSort, pageSize: "150" });
 if (urgentOnly) params.set("urgent", "1");
 if (tab === "mine") params.set("assignee", me || "___none___");
 else if (tab) params.set("status", tab);
 if (brand) params.set("brand", brand);
 if (sentiment) params.set("sentiment", sentiment);
 if (qDebounced) params.set("q", qDebounced);
 try {
 const res = await fetch("/api/comments?" + params.toString());
 const json = await res.json();
 setRows(json.rows ?? []);
 } catch {
 setRows([]);
 }
 setLoading(false);
 }, [tab, brand, me, sort, sentiment, qDebounced, urgentOnly]);

 useEffect(() => { load(); }, [load]);

 // เรียง "ฉลาด" ฝั่ง client: ยังไม่จัดการก่อน → รุนแรงมากก่อน → ใหม่ก่อน
 const display = sort !== "smart" ? rows : [...rows].sort((a, b) => {
 const sw = (s: string | null) => (s === "new" ? 0 : s === "in_progress" ? 1 : 2);
 if (sw(a.status) !== sw(b.status)) return sw(a.status) - sw(b.status);
 if ((b.severity ?? 0) !== (a.severity ?? 0)) return (b.severity ?? 0) - (a.severity ?? 0);
 return (b.created_at || "").localeCompare(a.created_at || "");
 });

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
 <div className="flex gap-1.5 mb-2.5 flex-wrap items-center">
 {TABS.map((t) => (
 <button key={t.key} onClick={() => setTab(t.key)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border ${tab === t.key ? "bg-shopee text-white border-shopee" : "bg-white border-line text-ink hover:bg-gray-50"}`}>{t.label}</button>
 ))}
 <select value={brand} onChange={(e) => setBrand(e.target.value)} className="bg-white border border-line px-3 py-1.5 rounded-lg text-[13px] ml-auto">
 <option value="">ทุกแบรนด์</option>
 {brands.map((b) => <option key={b} value={b}>{b}</option>)}
 </select>
 </div>

 {/* แถบกรอง/เรียงอย่างฉลาด */}
 <div className="flex gap-2 mb-3 flex-wrap items-center">
 <div className="relative">
 <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาในคอมเมนต์…" className="bg-white border border-line rounded-lg pl-3 pr-3 py-1.5 text-[13px] w-56" />
 </div>
 <label className="flex items-center gap-1.5 text-[12px] text-muted">เรียง
 <select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-white border border-line px-2.5 py-1.5 rounded-lg text-[13px] text-ink">
 {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
 </select>
 </label>
 <select value={sentiment} onChange={(e) => setSentiment(e.target.value)} className="bg-white border border-line px-2.5 py-1.5 rounded-lg text-[13px]">
 {SENTIMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
 </select>
 <button onClick={() => setUrgentOnly((v) => !v)} className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border ${urgentOnly ? "bg-neg text-white border-neg" : "bg-white border-line text-ink hover:bg-gray-50"}`}>
 {urgentOnly ? "🔴 เฉพาะด่วน" : "ทุกระดับ"}
 </button>
 {!loading && <span className="text-[12px] text-muted ml-auto">{rows.length} รายการ</span>}
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
 {display.map((r) => {
 const [bg, fg] = sevColors(r.severity ?? 0);
 return (
 <div key={r.comment_id} className="card card-pad">
 <div className="flex items-start gap-4">
 <span className="inline-flex items-center justify-center min-w-[34px] h-8 font-extrabold rounded-lg text-sm flex-none" style={{ background: bg, color: fg }}>{r.severity ?? 0}</span>
 <ProductThumb src={r.product_image} size={44} />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap mb-1">
 <b className="text-sm">{r.product_item_name || r.brand || "-"}</b>
 <span className="text-muted text-xs">{r.brand ? `${r.brand} • ` : ""}{r.product_name}</span>
 <span className="text-muted text-xs whitespace-nowrap">• {r.rating ?? "-"} <Star className="w-3 h-3 inline text-neu" /></span>
 <span className="chip !mb-0">{r.category || "-"}</span>
 {statusBadge(r.status)}
 {r.assignee && <span className="text-xs text-muted inline-flex items-center gap-1"><Avatar src={userAvatar.get(r.assignee) ?? null} name={r.assignee} size={18} /> {r.assignee}</span>}
 <span className="text-xs text-muted whitespace-nowrap" title={fmtDateTime(r.created_at)}>🕒 {fmtRelative(r.created_at)}</span>
 <ShopeeLink shopId={r.shop_id} itemId={r.product_name} className="ml-auto" />
 </div>
 <div className="text-[14px] text-ink leading-relaxed">“{r.comment_text}”</div>
 <ImageThumbs images={r.images} size={56} max={6} />
 {r.suggested_action && <div className="text-[12.5px] text-shopee mt-1.5">→ {r.suggested_action}</div>}
 <SellerReplyBadge reply={r.seller_reply} at={r.seller_reply_at} hidden={r.seller_reply_hidden} />
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

