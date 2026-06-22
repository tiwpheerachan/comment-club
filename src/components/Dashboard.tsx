"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Summary, TrendPoint, UrgentItem } from "@/lib/types";
import { dirBg, dirColor, fmtScore, sevColors } from "@/lib/ui";
import { Alert, ArrowRight, Bars, Box, Chat, Check, Compass, Pie, Refresh, Scale, Star, Trend, Wrench } from "./icons";
import { SentimentBar } from "./common";
import ImageThumbs from "./ImageThumbs";
import PageHeader from "./PageHeader";
import SentimentChart from "./SentimentChart";
import TrendChart from "./TrendChart";

const NO_BRAND = "ไม่ระบุแบรนด์";

export default function Dashboard({ summary, trend }: { summary: Summary; trend: TrendPoint[] }) {
 const [brand, setBrand] = useState("__all__");
 const [refreshing, setRefreshing] = useState(false);
 const isAll = brand === "__all__";

 const view = useMemo(() => {
 if (isAll) {
 const o = summary.overall;
 return { sentiment: o.sentiment, score: o.sentiment_score, direction: o.direction, cats: o.top_issues, total: summary.total_comments, urgentTotal: summary.urgent_total, avgRating: o.avg_rating, ratingDist: o.rating_dist };
 }
 const b = summary.brands.find((x) => x.brand === brand);
 return { sentiment: b?.sentiment ?? { positive: 0, neutral: 0, negative: 0 }, score: b?.sentiment_score ?? 0, direction: b?.direction ?? "-", cats: b?.top_issues ?? [], total: b?.count ?? 0, urgentTotal: b?.urgent_count ?? 0, avgRating: b?.avg_rating ?? null, ratingDist: null as Summary["overall"]["rating_dist"] | null };
 }, [brand, isAll, summary]);

 const urgent: UrgentItem[] = useMemo(
 () => summary.urgent.filter((u) => isAll || (u.brand || NO_BRAND) === brand),
 [brand, isAll, summary]
 );

 const posRate = view.total ? Math.round(((view.sentiment.positive || 0) / view.total) * 100) : 0;

 async function refresh() {
 setRefreshing(true);
 try {
 const res = await fetch("/api/pipeline", { method: "POST" });
 if (!res.ok) {
 const j = await res.json().catch(() => ({}));
 throw new Error(j.error || `HTTP ${res.status}`);
 }
 location.reload();
 } catch (e) {
 alert("ดึง+วิเคราะห์ใหม่ไม่สำเร็จ: " + (e instanceof Error ? e.message : e));
 setRefreshing(false);
 }
 }

 return (
 <>
 <PageHeader
 title="ภาพรวม"
 subtitle={`อัปเดต ${new Date(summary.generated_at).toLocaleString("th-TH")} • รอบ ${summary.window_days} วัน`}
 right={
 <>
 <select value={brand} onChange={(e) => setBrand(e.target.value)} className="bg-white border border-line px-3 py-2 rounded-[9px] text-sm cursor-pointer shadow-card hover:border-gray-400">
 <option value="__all__">ทุกแบรนด์ ({summary.brands.length})</option>
 {summary.brands.map((b) => (<option key={b.brand} value={b.brand}>{b.brand}</option>))}
 </select>
 <button onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 bg-shopee text-white px-4 py-2 rounded-[9px] text-sm font-semibold shadow-card hover:brightness-105 disabled:opacity-60">
 <Refresh className="w-[15px] h-[15px]" />
 {refreshing ? "กำลังประมวลผล…" : "ดึง+วิเคราะห์ใหม่"}
 </button>
 </>
 }
 />

 <div className="px-7 pt-6 pb-16 max-w-[1760px] mx-auto">
 {/* KPI row (full width) */}
 <div className="grid gap-4 mb-5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
 <div className="card card-pad [grid-column:span_2] min-[1100px]:[grid-column:span_2]">
 <div className="flex items-center justify-between">
 <h3 className="kpi-label">ทิศทางคอมเมนต์</h3>
 <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center" style={{ background: dirBg(view.score), color: dirColor(view.score) }}><Compass /></div>
 </div>
 <div className="flex items-end gap-3 mt-1">
 <div className="text-[30px] font-extrabold leading-none" style={{ color: dirColor(view.score) }}>{view.direction}</div>
 <div className="text-[15px] font-bold pb-0.5" style={{ color: dirColor(view.score) }}>{fmtScore(view.score)}</div>
 </div>
 <ScoreMeter score={view.score} />
 </div>
 <Kpi label="คอมเมนต์ (มีข้อความ)" icon={<Chat />}><div className="text-[26px] font-extrabold">{view.total.toLocaleString("th-TH")}</div><div className="text-[12px] text-muted mt-1">รอบ {summary.window_days} วัน</div></Kpi>
 <Kpi label="% เชิงบวก" icon={<Scale />}><div className="text-[26px] font-extrabold text-pos">{posRate}%</div><div className="text-[12px] text-muted mt-1"><span className="text-pos">{view.sentiment.positive || 0}</span> / <span className="text-neu">{view.sentiment.neutral || 0}</span> / <span className="text-neg">{view.sentiment.negative || 0}</span></div></Kpi>
 <Kpi label="ดาวเฉลี่ย" icon={<Star />}><div className="text-[26px] font-extrabold text-neu">{view.avgRating ?? "-"}</div><div className="text-[12px] text-muted mt-1">จาก 5 ดาว</div></Kpi>
 <Kpi label="ต้องรีบช่วยเหลือ" icon={<Alert />} danger={view.urgentTotal > 0}><div className="text-[26px] font-extrabold" style={{ color: view.urgentTotal > 0 ? "#dc2626" : "#16a34a" }}>{view.urgentTotal}</div><div className="text-[12px] text-muted mt-1">คอมเมนต์ด่วน</div></Kpi>
 </div>

 {/* main + right rail */}
 <div className="grid gap-5 items-start [grid-template-columns:minmax(0,1fr)_360px] max-[1180px]:grid-cols-1">
 {/* MAIN */}
 <div className="space-y-4 min-w-0">
 <div className="grid gap-4 [grid-template-columns:1.5fr_1fr] max-[760px]:grid-cols-1">
 <Card title="แนวโน้มคะแนนทิศทาง (รายวัน)" icon={<Trend className="w-[15px] h-[15px]" />}><TrendChart trend={trend} brand={brand} /></Card>
 <Card title="สัดส่วนความรู้สึก" icon={<Pie className="w-[15px] h-[15px]" />}><SentimentChart sentiment={view.sentiment} /></Card>
 </div>

 <div className="grid gap-4 [grid-template-columns:1fr_1.3fr] max-[760px]:grid-cols-1">
 <Card title="การกระจายของดาว" icon={<Star className="w-[15px] h-[15px]" />}>
 {view.ratingDist ? <RatingBars dist={view.ratingDist} /> : <div className="text-muted text-sm py-6 text-center">เลือก “ทุกแบรนด์” เพื่อดูการกระจายดาว</div>}
 </Card>
 <Card title="สิ่งที่ต้องแก้ / ปรับปรุง (คอมเมนต์เชิงลบ)" icon={<Wrench className="w-[15px] h-[15px]" />}><IssueBars cats={view.cats} /></Card>
 </div>

 <div>
 <div className="section-title !mt-2">
 <Bars className="w-[18px] h-[18px] text-shopee" /> เปรียบเทียบรายแบรนด์{" "}
 <span className="text-muted font-medium text-[13px]">(แย่สุด → ดีสุด)</span>
 <Link href="/brands" className="ml-auto text-shopee text-[13px] font-semibold hover:underline">ดูทั้งหมด →</Link>
 </div>
 <div className="card card-pad">
 {summary.brands.map((b) => {
 const s = b.sentiment;
 const tot = Math.max(1, (s.positive || 0) + (s.neutral || 0) + (s.negative || 0));
 return (
 <button key={b.brand} onClick={() => setBrand(b.brand)} className="w-full text-left flex items-center gap-4 py-3 border-b border-[#eef0f3] last:border-0 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
 <div className="min-w-[140px] flex-none">
 <b className="text-[14.5px]">{b.brand}</b>
 <div className="text-xs text-muted mt-px flex items-center gap-1">{b.count} คอมเมนต์ <Star className="w-[13px] h-[13px] text-neu" /> {b.avg_rating ?? "-"}</div>
 </div>
 <div className="flex-1 min-w-[120px]"><SentimentBar positive={s.positive || 0} neutral={s.neutral || 0} negative={s.negative || 0} /></div>
 <div className="text-right min-w-[150px] flex-none flex items-center justify-end gap-2">
 {b.urgent_count > 0 && <span className="text-[11px] text-neg font-semibold whitespace-nowrap">ด่วน {b.urgent_count}</span>}
 <span className="pill" style={{ background: dirBg(b.sentiment_score), color: dirColor(b.sentiment_score) }}>{b.direction}</span>
 <span className="text-muted text-xs w-9 text-right">{fmtScore(b.sentiment_score)}</span>
 </div>
 </button>
 );
 })}
 </div>
 </div>
 </div>

 {/* RIGHT RAIL — urgent queue */}
 <aside className="lg:sticky lg:top-[76px] space-y-3">
 <div className="flex items-center gap-2">
 <Alert className="w-[18px] h-[18px] text-neg" />
 <h3 className="text-[15px] font-bold text-neg">คอมเมนต์ด่วน</h3>
 {view.urgentTotal > 0 && <span className="text-xs bg-neg-bg text-neg font-bold px-2 py-0.5 rounded-full">{view.urgentTotal}</span>}
 {view.urgentTotal > 0 && <Link href="/triage" className="ml-auto text-shopee text-[12.5px] font-semibold hover:underline">จัดการ →</Link>}
 </div>

 {urgent.length === 0 ? (
 <div className="card card-pad flex flex-col items-center gap-2 py-8 text-pos"><Check className="w-6 h-6" /><div className="text-sm font-semibold">ไม่มีคอมเมนต์ด่วน </div></div>
 ) : (
 <div className="space-y-2.5 lg:max-h-[calc(100vh-130px)] lg:overflow-y-auto lg:pr-1">
 {urgent.slice(0, 20).map((u, i) => {
 const [bg, fg] = sevColors(u.severity);
 return (
 <div key={u.comment_id ?? i} className="card card-pad !p-3">
 <div className="flex items-center gap-2 mb-1 text-[11.5px]">
 <span className="inline-flex items-center justify-center min-w-[26px] h-6 font-extrabold rounded text-[12px] flex-none" style={{ background: bg, color: fg }}>{u.severity}</span>
 <b className="text-[12.5px]">{u.brand || "-"}</b>
 <span className="text-muted">{u.rating ?? "-"}★</span>
 <span className="chip !mb-0 !mr-0 !py-0.5 ml-auto">{u.category || "-"}</span>
 </div>
 <div className="text-[12.5px] text-ink leading-snug line-clamp-3">“{u.comment_text}”</div>
 <ImageThumbs images={u.images} size={38} max={4} />
 {u.suggested_action && <div className="text-[11.5px] text-shopee mt-1 flex items-start gap-1"><ArrowRight className="w-3 h-3 mt-0.5 flex-none" />{u.suggested_action}</div>}
 </div>
 );
 })}
 {view.urgentTotal > 20 && <Link href="/triage" className="block text-center text-shopee text-[13px] font-semibold py-2 hover:underline">ดูอีก {view.urgentTotal - 20} รายการ →</Link>}
 </div>
 )}
 </aside>
 </div>
 </div>
 </>
 );
}

function Kpi({ label, icon, danger, children }: { label: string; icon: React.ReactNode; danger?: boolean; children: React.ReactNode }) {
 return (
 <div className="card card-pad" style={danger ? { borderColor: "#f3bcbc" } : undefined}>
 <div className="flex items-center justify-between">
 <h3 className="kpi-label">{label}</h3>
 <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center" style={{ background: danger ? "#fdecec" : "#f9fafb", color: danger ? "#dc2626" : "#6b7280" }}>{icon}</div>
 </div>
 <div className="mt-1">{children}</div>
 </div>
 );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
 return (
 <div className="card card-pad">
 <h3 className="kpi-label mb-3">{icon} {title}</h3>
 {children}
 </div>
 );
}

function ScoreMeter({ score }: { score: number }) {
 const left = Math.min(100, Math.max(0, (score + 100) / 2));
 return (
 <div className="mt-3">
 <div className="relative h-[8px] rounded-full" style={{ background: "linear-gradient(90deg,#dc2626,#f7c948 50%,#16a34a)" }}>
 <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 shadow" style={{ left: `${left}%`, borderColor: dirColor(score) }} />
 </div>
 <div className="flex justify-between text-[10px] text-muted mt-1"><span>-100 แย่</span><span>0</span><span>+100 ดี</span></div>
 </div>
 );
}

function RatingBars({ dist }: { dist: Record<"1" | "2" | "3" | "4" | "5", number> }) {
 const total = (["1", "2", "3", "4", "5"] as const).reduce((s, k) => s + (dist[k] || 0), 0) || 1;
 const colors: Record<string, string> = { "5": "#16a34a", "4": "#65a30d", "3": "#d97706", "2": "#ea580c", "1": "#dc2626" };
 return (
 <div className="space-y-2">
 {(["5", "4", "3", "2", "1"] as const).map((star) => {
 const n = dist[star] || 0;
 const pct = Math.round((n / total) * 100);
 return (
 <div key={star} className="flex items-center gap-2.5 text-[13px]">
 <div className="w-9 flex-none text-muted whitespace-nowrap">{star} ★</div>
 <div className="flex-1 h-[12px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${pct}%`, background: colors[star], height: "100%" }} /></div>
 <div className="w-20 text-right text-muted">{n.toLocaleString("th-TH")} <span className="text-[11px]">({pct}%)</span></div>
 </div>
 );
 })}
 </div>
 );
}

function IssueBars({ cats }: { cats: { category: string; count: number }[] }) {
 if (!cats || cats.length === 0) return <div className="text-muted text-sm py-6 text-center">ไม่มีประเด็นปัญหาที่เด่นชัด </div>;
 const max = Math.max(1, ...cats.map((c) => c.count));
 return (
 <div className="space-y-2.5">
 {cats.map((c) => (
 <div key={c.category} className="flex items-center gap-2.5 text-[13px]">
 <div className="w-[150px] flex-none flex items-center gap-1.5"><Box className="w-[14px] h-[14px] text-shopee" /> {c.category}</div>
 <div className="flex-1 h-[12px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${(c.count / max) * 100}%`, background: "#5f9579", height: "100%" }} /></div>
 <div className="w-10 text-right font-semibold">{c.count}</div>
 </div>
 ))}
 </div>
 );
}
