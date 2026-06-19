"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RetentionBundle } from "@/lib/db";
import { Alert, Check, Info } from "./icons";

const ToneIcon = ({ tone }: { tone: "good" | "bad" | "info" }) =>
  tone === "bad" ? <Alert className="w-4 h-4 flex-none mt-0.5" /> : tone === "good" ? <Check className="w-4 h-4 flex-none mt-0.5" /> : <Info className="w-4 h-4 flex-none mt-0.5" />;

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const numTh = (n: number) => Math.round(n).toLocaleString("th-TH");

const SEG: Record<string, { color: string; bg: string; action: string }> = {
 "แชมเปี้ยน": { color: "#15803d", bg: "#dcfce7", action: "ให้รางวัล/สิทธิพิเศษ ชวนรีวิว บอกต่อ" },
 "ลูกค้าประจำ": { color: "#0d9488", bg: "#ccfbf1", action: "อัปเซล/ครอสเซล ชวนเป็นสมาชิก" },
 "ลูกค้าใหม่": { color: "#2563eb", bg: "#dbeafe", action: "ต้อนรับ ส่งคู่มือ กระตุ้นซื้อซ้ำเร็ว" },
 "มีแวว": { color: "#7c3aed", bg: "#ede9fe", action: "เสนอสินค้าเกี่ยวข้อง โปรครั้งที่ 2" },
 "กำลังจะหลุด": { color: "#ea580c", bg: "#ffedd5", action: "ส่งคูปองดึงกลับด่วน" },
 "ห้ามเสีย (เคย VIP)": { color: "#dc2626", bg: "#fee2e2", action: "ติดต่อส่วนตัว ข้อเสนอพิเศษสุด" },
 "หลับใหล": { color: "#d97706", bg: "#fef3c7", action: "รี-เอนเกจ เตือนแบรนด์ ของแถม" },
 "หลุดไปแล้ว": { color: "#64748b", bg: "#f1f5f9", action: "แคมเปญ win-back ใหญ่ หรือปล่อย" },
};
const SEG_ORDER = ["แชมเปี้ยน", "ลูกค้าประจำ", "ลูกค้าใหม่", "มีแวว", "กำลังจะหลุด", "ห้ามเสีย (เคย VIP)", "หลับใหล", "หลุดไปแล้ว"];
const TABS = [
 { k: "overview", label: "ภาพรวม" },
 { k: "behavior", label: "พฤติกรรม & Cohort" },
 { k: "rfm", label: "กลุ่มลูกค้า (RFM)" },
 { k: "deep", label: "เชิงลึก " },
 { k: "winback", label: "Win-back & VIP" },
];

function Card({ title, hint, children, className = "" }: { title?: string; hint?: string; children: React.ReactNode; className?: string }) {
 return (
 <div className={`card card-pad ${className}`}>
 {title && <h3 className="kpi-label mb-3">{title} {hint && <span className="normal-case text-muted font-normal">{hint}</span>}</h3>}
 {children}
 </div>
 );
}
function Kpi({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
 return (
 <div className="card card-pad">
 <div className="kpi-label">{label}</div>
 <div className="text-[25px] font-extrabold mt-1" style={color ? { color } : undefined}>{value}</div>
 {sub && <div className="text-[11.5px] text-muted mt-0.5">{sub}</div>}
 </div>
 );
}
const AllTag = () => <span className="text-[11px] text-muted font-normal">(ทุกแบรนด์)</span>;

export default function RetentionClient({ data }: { data: RetentionBundle }) {
 const [tab, setTab] = useState("overview");
 const [brand, setBrand] = useState("__all__");
 const [monthsBack, setMonthsBack] = useState(24);

 const allSum = data.summary.find((s) => s.scope === "ALL");
 const brandsList = useMemo(() => data.summary.filter((s) => s.scope !== "ALL").sort((a, b) => b.repeat_rate - a.repeat_rate), [data.summary]);
 const scope = brand === "__all__" ? allSum : data.summary.find((s) => s.scope === brand) ?? allSum;
 const isAll = brand === "__all__";
 const k = data.kpi;

 const filterByBrand = <T extends { brands: string }>(arr: T[]) => (isAll ? arr : arr.filter((x) => (x.brands || "").includes(brand)));
 const vips = filterByBrand(data.topCustomers);
 const atRisk = filterByBrand(data.atRisk);
 const winbackValue = atRisk.reduce((s, c) => s + c.spend, 0);

 // ---- derived: repeat ladder ----
 const ladder = useMemo(() => {
 const g = (b: string) => data.distribution.find((d) => d.bucket === b)?.customers ?? 0;
 const c1 = g("1"), c2 = g("2"), c3 = g("3"), c4 = g("4"), c5 = g("5+");
 const ge1 = c1 + c2 + c3 + c4 + c5, ge2 = c2 + c3 + c4 + c5, ge3 = c3 + c4 + c5, ge4 = c4 + c5, ge5 = c5;
 const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
 return [
 { step: "ซื้อครั้งที่ 1 → 2", rate: pct(ge2, ge1), from: ge1, to: ge2 },
 { step: "ครั้งที่ 2 → 3", rate: pct(ge3, ge2), from: ge2, to: ge3 },
 { step: "ครั้งที่ 3 → 4", rate: pct(ge4, ge3), from: ge3, to: ge4 },
 { step: "ครั้งที่ 4 → 5+", rate: pct(ge5, ge4), from: ge4, to: ge5 },
 ];
 }, [data.distribution]);

 // ---- churn rate & CLV from RFM ----
 const totalRfm = data.rfm.reduce((s, r) => s + r.customers, 0) || 1;
 const churned = data.rfm.filter((r) => r.segment === "หลุดไปแล้ว" || r.segment === "ห้ามเสีย (เคย VIP)").reduce((s, r) => s + r.customers, 0);
 const churnRate = Math.round((churned / totalRfm) * 1000) / 10;
 const activeRfm = data.rfm.filter((r) => ["แชมเปี้ยน", "ลูกค้าประจำ"].includes(r.segment)).reduce((s, r) => s + r.customers, 0);

 // ---- review × retention highlight: ผู้รีวิว vs ไม่เคยรีวิว ----
 const reviewNon = data.review.find((r) => r.grp.includes("ไม่เคย"));
 const reviewers = data.review.filter((r) => !r.grp.includes("ไม่เคย"));
 const reviewerCust = reviewers.reduce((s, r) => s + r.customers, 0);
 const reviewerRate = reviewerCust ? Math.round((reviewers.reduce((s, r) => s + r.repeat_rate * r.customers, 0) / reviewerCust) * 10) / 10 : 0;
 const reviewGap = reviewNon ? Math.round((reviewerRate - reviewNon.repeat_rate) * 10) / 10 : null;

 // ---- cohort ----
 const cohort = useMemo(() => {
 const by = new Map<string, Map<number, number>>();
 for (const r of data.cohort) { if (!by.has(r.cohort)) by.set(r.cohort, new Map()); by.get(r.cohort)!.set(r.months_since, r.customers); }
 const rows = [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
 const maxMi = Math.min(12, Math.max(0, ...data.cohort.map((c) => c.months_since)));
 return { rows, maxMi };
 }, [data.cohort]);

 const monthly = useMemo(() => data.monthly.slice(-monthsBack).map((m) => ({ month: m.month.slice(0, 7), "ใหม่": m.new_customers, "ซื้อซ้ำ": m.returning_customers })), [data.monthly, monthsBack]);

 if (!allSum || !scope) return <div className="p-7"><div className="card card-pad text-muted">ยังไม่มีข้อมูล retention — รัน <code>npm run retention</code></div></div>;

 const repeatPie = [{ name: "ซื้อครั้งเดียว", value: scope.one_time, color: "#cbd5e1" }, { name: "ซื้อซ้ำ (≥2)", value: scope.repeat_customers, color: "#16a34a" }];
 const distMax = Math.max(1, ...data.distribution.map((d) => d.customers));
 const brandmixTotal = data.brandmix.reduce((s, b) => s + b.customers, 0) || 1;

 return (
 <div className="px-8 pt-5 pb-16 max-w-[2000px] mx-auto">
 {/* controls */}
 <div className="flex items-center gap-2 flex-wrap mb-5 sticky top-[60px] z-[5] bg-[#f6f7f9]/90 backdrop-blur py-2 -mx-2 px-2 rounded-xl">
 <div className="flex gap-1.5 flex-wrap">
 {TABS.map((t) => (
 <button key={t.k} onClick={() => setTab(t.k)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${tab === t.k ? "bg-shopee text-white border-shopee" : "bg-white border-line text-ink hover:bg-slate-50"}`}>{t.label}</button>
 ))}
 </div>
 <select value={brand} onChange={(e) => setBrand(e.target.value)} className="bg-white border border-line px-3 py-1.5 rounded-lg text-[13px] ml-auto cursor-pointer">
 <option value="__all__">ทุกแบรนด์</option>
 {brandsList.map((b) => <option key={b.scope} value={b.scope}>{b.scope}</option>)}
 </select>
 </div>

 {/* KPI (always visible) */}
 <div className="grid gap-4 mb-5 [grid-template-columns:repeat(auto-fit,minmax(165px,1fr))]">
 <Kpi label={`ลูกค้า${isAll ? "ทั้งหมด" : " " + brand}`} value={numTh(scope.customers)} />
 <Kpi label="อัตราซื้อซ้ำ" value={scope.repeat_rate + "%"} color="#16a34a" />
 <Kpi label="% รายได้จากลูกค้าเก่า" value={(k.returning_rev_pct || 0) + "%"} color="#0d9488" sub={isAll ? undefined : "ทุกแบรนด์"} />
 <Kpi label="เฉลี่ยออเดอร์/คน" value={String(scope.avg_orders)} />
 <Kpi label="เวลาซื้อครั้งที่ 2" value={k.median_days_to_2nd ? numTh(k.median_days_to_2nd) + " วัน" : "-"} sub={isAll ? "ค่ากลาง" : "ทุกแบรนด์"} />
 <Kpi label="Churn (หลุด >1 ปี)" value={churnRate + "%"} color="#dc2626" sub="ทุกแบรนด์" />
 </div>

 {/* ===================== OVERVIEW ===================== */}
 {tab === "overview" && (
 <div className="space-y-5">
 <Card title=" ข้อสังเกต Retention อัตโนมัติ">
 <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
 {buildInsights({ allSum, k, brandsList, atRiskCount: data.atRisk.length, winbackValue: data.atRisk.reduce((s, c) => s + c.spend, 0), reviewGap, churnRate }).map((ins, i) => (
 <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg text-[13px] leading-snug ${ins.tone === "bad" ? "bg-neg-bg text-neg" : ins.tone === "good" ? "bg-pos-bg text-pos" : "bg-slate-50 text-ink"}`}>
 <ToneIcon tone={ins.tone} /><span>{ins.text}</span>
 </div>
 ))}
 </div>
 </Card>
 <div className="grid gap-4 [grid-template-columns:1fr_1fr_1fr] max-[1100px]:grid-cols-1">
 <Card title="ลูกค้าใหม่ vs ซื้อซ้ำ">
 <div className="h-[230px]">
 <ResponsiveContainer width="100%" height="100%"><PieChart>
 <Pie data={repeatPie} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2} stroke="#fff" strokeWidth={3}>{repeatPie.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie>
 <Tooltip formatter={(v: number) => numTh(v) + " คน"} /><Legend verticalAlign="bottom" iconType="circle" formatter={(v) => <span style={{ color: "#1c2330", fontSize: 12 }}>{v}</span>} />
 </PieChart></ResponsiveContainer>
 </div>
 </Card>
 <Card title="จำนวนออเดอร์ต่อลูกค้า" hint={isAll ? "" : "(ทุกแบรนด์)"}>
 <div className="space-y-2.5 mt-2">
 {data.distribution.map((d) => (
 <div key={d.bucket} className="flex items-center gap-2.5 text-[13px]">
 <div className="w-14 flex-none text-muted">{d.bucket} ครั้ง</div>
 <div className="flex-1 h-[14px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${(d.customers / distMax) * 100}%`, height: "100%", background: d.bucket === "1" ? "#cbd5e1" : "#16a34a" }} /></div>
 <div className="w-24 text-right text-muted">{numTh(d.customers)}</div>
 </div>
 ))}
 </div>
 </Card>
 <Card title="Repeat Purchase Ladder" hint="(โอกาสไปต่อแต่ละครั้ง)">
 <div className="space-y-3 mt-1">
 {ladder.map((l) => (
 <div key={l.step}>
 <div className="flex justify-between text-[12.5px] mb-1"><span>{l.step}</span><b style={{ color: l.rate >= 40 ? "#16a34a" : l.rate >= 20 ? "#d97706" : "#dc2626" }}>{l.rate}%</b></div>
 <div className="h-[10px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${Math.min(100, l.rate)}%`, height: "100%", background: l.rate >= 40 ? "#16a34a" : l.rate >= 20 ? "#d97706" : "#dc2626" }} /></div>
 </div>
 ))}
 <div className="text-[11.5px] text-muted">ยิ่งครั้งสูง ยิ่งเหนียว — โฟกัสดันลูกค้าให้ผ่าน “ครั้งที่ 2”</div>
 </div>
 </Card>
 </div>

 {/* เปรียบเทียบแบรนด์ */}
 <Card title="เปรียบเทียบแบรนด์ — อัตราซื้อซ้ำ" hint="(เรียงมาก→น้อย • คลิกเพื่อกรองทั้งหน้า)">
 <div className="grid gap-x-8 gap-y-2 [grid-template-columns:repeat(auto-fill,minmax(420px,1fr))]">
 {brandsList.map((b) => (
 <button key={b.scope} onClick={() => setBrand(brand === b.scope ? "__all__" : b.scope)}
 className={`flex items-center gap-2.5 text-[13px] py-1 px-2 -mx-2 rounded-lg transition-colors ${brand === b.scope ? "bg-shopee/10" : "hover:bg-slate-50"}`}>
 <div className="w-[100px] flex-none truncate text-left font-medium">{b.scope}</div>
 <div className="flex-1 h-[14px] bg-[#f9fafb] rounded-md overflow-hidden">
 <div style={{ width: `${Math.min(100, b.repeat_rate)}%`, height: "100%", background: b.repeat_rate >= 30 ? "#16a34a" : b.repeat_rate >= 20 ? "#d97706" : "#dc2626" }} />
 </div>
 <div className="w-11 text-right font-bold">{b.repeat_rate}%</div>
 <div className="w-20 text-right text-muted text-[11.5px]">{numTh(b.customers)} คน</div>
 <div className="w-16 text-right text-muted text-[11.5px]">{b.avg_orders}x</div>
 </button>
 ))}
 </div>
 <div className="text-[11.5px] text-muted mt-3"> ≥30% เหนียวแน่น • 20–30% มาตรฐาน • &lt;20% ต้องเร่ง retention</div>
 </Card>
 </div>
 )}

 {/* ===================== BEHAVIOR & COHORT ===================== */}
 {tab === "behavior" && (
 <div className="space-y-5">
 <Card title="Cohort Retention" hint="(ลูกค้าที่ได้มาเดือนนั้น กลับมาซื้อกี่ % ในเดือนถัดๆ • ทุกแบรนด์)">
 <div className="overflow-x-auto">
 <table className="text-[12px] border-separate [border-spacing:3px]">
 <thead><tr><th className="text-left p-1.5 text-muted font-semibold sticky left-0 bg-white">Cohort</th><th className="text-right p-1.5 text-muted font-semibold">ลูกค้า</th>{Array.from({ length: cohort.maxMi + 1 }).map((_, i) => <th key={i} className="text-center p-1.5 text-muted font-semibold w-[42px]">M{i}</th>)}</tr></thead>
 <tbody>
 {cohort.rows.map(([c, m]) => {
 const base = m.get(0) || 0;
 return (<tr key={c}><td className="p-1.5 font-medium whitespace-nowrap sticky left-0 bg-white">{c.slice(0, 7)}</td><td className="p-1.5 text-right text-muted">{numTh(base)}</td>
 {Array.from({ length: cohort.maxMi + 1 }).map((_, i) => {
 const v = m.get(i); if (v == null || base === 0) return <td key={i} />;
 const pct = Math.round((v / base) * 100); const op = i === 0 ? 1 : Math.max(0.06, pct / 100);
 return <td key={i} className="text-center rounded font-semibold" style={{ background: `rgba(22,163,74,${op})`, color: op > 0.5 ? "#fff" : "#15803d", padding: "6px 4px" }} title={`${numTh(v)} คน`}>{pct}%</td>;
 })}</tr>);
 })}
 </tbody>
 </table>
 </div>
 </Card>
 <Card title="ลูกค้าใหม่ vs ซื้อซ้ำ (รายเดือน)">
 <div className="flex justify-end gap-1.5 mb-2">{[12, 24, 48].map((m) => <button key={m} onClick={() => setMonthsBack(m)} className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border ${monthsBack === m ? "bg-shopee text-white border-shopee" : "bg-white border-line hover:bg-slate-50"}`}>{m} เดือน</button>)}</div>
 <ResponsiveContainer width="100%" height={300}>
 <BarChart data={monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
 <CartesianGrid stroke="#eef0f3" vertical={false} /><XAxis dataKey="month" tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
 <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ec", fontSize: 12 }} formatter={(v: number) => numTh(v) + " คน"} /><Legend wrapperStyle={{ fontSize: 12 }} />
 <Bar dataKey="ใหม่" stackId="a" fill="#cbd5e1" /><Bar dataKey="ซื้อซ้ำ" stackId="a" fill="#16a34a" radius={[3, 3, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </Card>
 </div>
 )}

 {/* ===================== RFM ===================== */}
 {tab === "rfm" && (
 <div className="space-y-5">
 <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
 <Kpi label="ลูกค้าหลัก (แชมเปี้ยน+ประจำ)" value={numTh(activeRfm)} color="#15803d" />
 <Kpi label="กลุ่มเสี่ยงหลุด+หลุด" value={numTh(churned)} color="#dc2626" />
 <Kpi label="Churn rate" value={churnRate + "%"} color="#dc2626" />
 </div>
 <Card title="กลุ่มลูกค้า (RFM Segmentation)" hint="(R=ความใหม่ F=ความถี่ M=ยอดซื้อ • ทุกแบรนด์)">
 <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(245px,1fr))]">
 {SEG_ORDER.filter((n) => data.rfm.some((r) => r.segment === n)).map((name) => {
 const r = data.rfm.find((x) => x.segment === name)!; const meta = SEG[name];
 return (
 <div key={name} className="card card-pad" style={{ borderTop: `3px solid ${meta.color}` }}>
 <div className="flex items-center justify-between"><span className="font-bold text-[14px]" style={{ color: meta.color }}>{name}</span><span className="pill" style={{ background: meta.bg, color: meta.color }}>{numTh(r.customers)}</span></div>
 <div className="text-[11.5px] text-muted mt-2 grid grid-cols-3 gap-1"><div>ห่าง<br /><b className="text-ink">{numTh(r.avg_recency)}ว.</b></div><div>ความถี่<br /><b className="text-ink">{r.avg_frequency}x</b></div><div>ยอดเฉลี่ย<br /><b className="text-ink">{baht(r.avg_monetary)}</b></div></div>
 <div className="text-[11.5px] text-muted mt-1.5">มูลค่ารวมกลุ่ม: <b className="text-ink">{baht(r.total_spend)}</b></div>
 <div className="text-[12px] mt-2 p-2 rounded-lg" style={{ background: meta.bg, color: meta.color }}> {meta.action}</div>
 </div>
 );
 })}
 </div>
 </Card>
 <Card title="มูลค่า (CLV) ต่อกลุ่ม — กลุ่มไหนสร้างรายได้สูงสุด">
 <CLVBars rfm={data.rfm} />
 </Card>
 </div>
 )}

 {/* ===================== DEEP (PhD) ===================== */}
 {tab === "deep" && (
 <div className="space-y-5">
 {/* review x retention highlight */}
 <Card title=" รีวิว × การกลับมาซื้อ" hint="(insight ข้ามชุดข้อมูล: รีวิว ↔ ออเดอร์)">
 {data.review.length === 0 ? <div className="text-muted text-sm">ยังไม่มีข้อมูล</div> : (
 <>
 {reviewGap != null && (
 <div className="mb-3 p-3 rounded-lg bg-slate-50 text-[13.5px] leading-relaxed">
 ลูกค้าที่ <b className="text-pos">เคยรีวิว</b> กลับมาซื้อซ้ำ <b className="text-pos">{reviewerRate}%</b> เทียบกับคน <b className="text-neg">ไม่เคยรีวิว</b> เพียง <b className="text-neg">{reviewNon!.repeat_rate}%</b>
 {reviewGap > 0 && <> — ต่างกันถึง <b>{reviewGap} จุด</b> กระตุ้นให้ลูกค้ารีวิว และดูแลทุกคนที่รีวิว (แม้รีวิวแย่ก็ยังภักดี) = เพิ่ม retention โดยตรง</>}
 </div>
 )}
 <div className="space-y-2.5">
 {data.review.map((r) => (
 <div key={r.grp} className="flex items-center gap-2.5 text-[13px]">
 <div className="w-[150px] flex-none">{r.grp}</div>
 <div className="flex-1 h-[14px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${Math.min(100, r.repeat_rate)}%`, height: "100%", background: r.grp.includes("แย่") ? "#dc2626" : r.grp.includes("ดี") ? "#16a34a" : "#d97706" }} /></div>
 <div className="w-12 text-right font-bold">{r.repeat_rate}%</div>
 <div className="w-20 text-right text-muted text-[11.5px]">{numTh(r.customers)} คน</div>
 </div>
 ))}
 </div>
 </>
 )}
 </Card>

 <div className="grid gap-4 [grid-template-columns:1fr_1fr] max-[900px]:grid-cols-1">
 <Card title="ลูกค้ากลับมาซื้อภายในกี่วัน" hint="(หน้าต่างทองยิงโปร • ทุกแบรนด์)">
 <ResponsiveContainer width="100%" height={250}>
 <BarChart data={data.gap} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
 <CartesianGrid stroke="#eef0f3" vertical={false} /><XAxis dataKey="bucket" tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
 <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ec", fontSize: 12 }} formatter={(v: number) => numTh(v) + " ครั้ง"} />
 <Bar dataKey="n" name="จำนวน" radius={[3, 3, 0, 0]}>
 {data.gap.map((_, i) => <Cell key={i} fill={["#22c55e", "#84cc16", "#eab308", "#f59e0b", "#f97316", "#ef4444"][i] || "#94a3b8"} />)}
 </Bar>
 </BarChart>
 </ResponsiveContainer>
 </Card>
 <Card title="Brand Stickiness" hint="(ลูกค้าผูกกับกี่แบรนด์ • ทุกแบรนด์)">
 <div className="space-y-3 mt-2">
 {data.brandmix.map((b) => (
 <div key={b.bucket} className="flex items-center gap-2.5 text-[13px]">
 <div className="w-[90px] flex-none">{b.bucket}</div>
 <div className="flex-1 h-[16px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${(b.customers / brandmixTotal) * 100}%`, height: "100%", background: b.bucket.startsWith("1") ? "#2563eb" : b.bucket.startsWith("2") ? "#7c3aed" : "#16a34a" }} /></div>
 <div className="w-12 text-right font-semibold">{Math.round((b.customers / brandmixTotal) * 100)}%</div>
 <div className="w-20 text-right text-muted text-[11.5px]">{numTh(b.customers)}</div>
 </div>
 ))}
 <div className="text-[11.5px] text-muted">ถ้าส่วนใหญ่ซื้อแบรนด์เดียว = โอกาส cross-sell ข้ามแบรนด์สูง</div>
 </div>
 </Card>
 </div>

 <Card title="Revenue Concentration (Pareto)" hint="(ลูกค้าหัวกะทิสร้างรายได้กี่ % • ทุกแบรนด์)">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 {[["Top 1%", k.pareto_top1], ["Top 5%", k.pareto_top5], ["Top 10%", k.pareto_top10], ["Top 20%", k.pareto_top20]].map(([lab, v]) => (
 <div key={lab as string} className="bg-slate-50 rounded-xl p-3 border border-line/60 text-center">
 <div className="text-[12px] text-muted">{lab}</div>
 <div className="text-[22px] font-extrabold text-shopee mt-1">{v ?? 0}%</div>
 <div className="text-[11px] text-muted">ของรายได้</div>
 </div>
 ))}
 </div>
 <div className="text-[12px] text-muted mt-3"> ถ้า Top 10% สร้างรายได้สูงมาก = พึ่งพาลูกค้ากลุ่มเล็ก (ความเสี่ยง) → ต้องรักษากลุ่มนี้เป็นพิเศษ และกระจายฐาน</div>
 </Card>
 </div>
 )}

 {/* ===================== WIN-BACK & VIP ===================== */}
 {tab === "winback" && (
 <div className="grid gap-4 [grid-template-columns:1fr_1fr] max-[1000px]:grid-cols-1">
 <Card title=" ลูกค้าน่าดึงกลับ (Win-back)" hint={`${atRisk.length} คน • ${baht(winbackValue)}`}>
 <p className="text-[12px] text-muted mb-2">ลูกค้าซื้อซ้ำที่เงียบไป 120–540 วัน เรียงตามมูลค่า</p>
 <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
 {atRisk.length === 0 ? <div className="text-muted text-sm py-4 text-center">ไม่มีลูกค้ากลุ่มนี้ </div> :
 atRisk.slice(0, 60).map((c) => (
 <div key={c.buyer} className="border border-line rounded-lg p-2.5">
 <div className="flex items-center justify-between gap-2"><span className="font-semibold text-[13px] truncate">{c.buyer}</span><span className="text-neg font-bold text-[13px] flex-none">{baht(c.spend)}</span></div>
 <div className="text-[11.5px] text-muted mt-0.5">{c.orders} ออเดอร์ • หายไป {numTh(c.days_since)} วัน</div>
 <div className="text-[11px] text-muted truncate">{c.brands}</div>
 </div>
 ))}
 </div>
 </Card>
 <Card title=" ลูกค้า VIP (สั่งมากสุด)">
 <div className="overflow-x-auto">
 <table className="w-full text-[13px]">
 <thead><tr className="text-muted text-[11px] uppercase border-b border-line"><th className="text-left p-2 font-semibold">ลูกค้า</th><th className="text-right p-2 font-semibold">ออเดอร์</th><th className="text-right p-2 font-semibold">ยอดซื้อ</th><th className="text-left p-2 font-semibold">ล่าสุด</th></tr></thead>
 <tbody>
 {vips.slice(0, 40).map((c) => (
 <tr key={c.buyer} className="border-b border-[#eef0f3] last:border-0">
 <td className="p-2 font-medium">{c.buyer}</td><td className="p-2 text-right font-semibold text-shopee">{c.orders}</td><td className="p-2 text-right">{baht(c.spend)}</td>
 <td className="p-2 text-muted whitespace-nowrap">{c.last_order ? new Date(c.last_order).toLocaleDateString("th-TH") : "-"}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </Card>
 </div>
 )}
 </div>
 );
}

function CLVBars({ rfm }: { rfm: RetentionBundle["rfm"] }) {
 const rows = [...rfm].sort((a, b) => b.total_spend - a.total_spend);
 const max = Math.max(1, ...rows.map((r) => r.total_spend));
 return (
 <div className="space-y-2.5">
 {rows.map((r) => {
 const meta = SEG[r.segment] || { color: "#64748b" };
 return (
 <div key={r.segment} className="flex items-center gap-2.5 text-[13px]">
 <div className="w-[150px] flex-none truncate">{r.segment}</div>
 <div className="flex-1 h-[16px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${(r.total_spend / max) * 100}%`, height: "100%", background: meta.color }} /></div>
 <div className="w-24 text-right font-semibold">{baht(r.total_spend)}</div>
 </div>
 );
 })}
 </div>
 );
}

function buildInsights({ allSum, k, brandsList, atRiskCount, winbackValue, reviewGap, churnRate }: {
 allSum: RetentionBundle["summary"][number]; k: Record<string, number>; brandsList: RetentionBundle["summary"]; atRiskCount: number; winbackValue: number; reviewGap: number | null; churnRate: number;
}) {
 const out: { icon: string; text: string; tone: "good" | "bad" | "info" }[] = [];
 const rr = allSum.repeat_rate;
 out.push({ icon: rr >= 30 ? "" : rr >= 20 ? "" : "", tone: rr >= 30 ? "good" : rr >= 20 ? "info" : "bad", text: `อัตราซื้อซ้ำ ${rr}% ${rr >= 30 ? "(สูง ฐานเหนียวแน่น)" : rr >= 20 ? "(มาตรฐาน)" : "(ต่ำ ควรเร่ง)"}` });
 if (k.returning_rev_pct) out.push({ icon: "", tone: k.returning_rev_pct >= 40 ? "good" : "info", text: `รายได้ ${k.returning_rev_pct}% มาจากลูกค้าเก่า — รักษาไว้สำคัญกว่าหาใหม่` });
 if (k.pareto_top10) out.push({ icon: "", tone: k.pareto_top10 >= 50 ? "bad" : "info", text: `ลูกค้า Top 10% สร้างรายได้ ${k.pareto_top10}% ${k.pareto_top10 >= 50 ? "(กระจุกตัวสูง = เสี่ยง)" : ""}` });
 if (k.median_days_to_2nd) out.push({ icon: "", tone: "info", text: `ซื้อครั้งที่ 2 ภายใน ~${Math.round(k.median_days_to_2nd)} วัน — ยิงโปรก่อนถึงช่วงนี้` });
 if (reviewGap != null && reviewGap > 0) out.push({ icon: "", tone: "good", text: `ลูกค้าที่เคยรีวิว ซื้อซ้ำมากกว่าคนไม่รีวิว ${reviewGap} จุด — กระตุ้นให้รีวิว = เพิ่ม retention` });
 out.push({ icon: "", tone: churnRate >= 30 ? "bad" : "info", text: `Churn (หลุดไป >1 ปี) ${churnRate}%` });
 if (brandsList.length) out.push({ icon: "", tone: "good", text: `แบรนด์ลูกค้าภักดีสุด: "${brandsList[0].scope}" ${brandsList[0].repeat_rate}%` });
 if (atRiskCount) out.push({ icon: "", tone: "bad", text: `มีลูกค้าน่าดึงกลับ ${atRiskCount} คน มูลค่ารวม ${baht(winbackValue)}` });
 return out;
}
