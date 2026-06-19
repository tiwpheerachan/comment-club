"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { BrandStat, DailyPoint, ProductStat } from "@/lib/db";
import { dirColor, fmtScore } from "@/lib/ui";

type BrandDaily = { date: string; brand: string; total: number; urgent: number; score: number };
type CatDaily = { date: string; category: string; total: number };

const RANGES = [30, 90, 180, 365];
const LINE_COLORS = ["#4e7d63", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export default function TrendsClient({
  daily, brandDaily, categoryDaily, products,
}: {
  daily: DailyPoint[];
  brandDaily: BrandDaily[];
  categoryDaily: CatDaily[];
  brands: BrandStat[];
  products: ProductStat[];
}) {
  const [range, setRange] = useState(90);

  const maxDate = daily.length ? daily[daily.length - 1].date : null;

  const { sel, prev, selBrand, prevBrand, selCat, prevCat } = useMemo(() => {
    if (!maxDate) return { sel: [], prev: [], selBrand: [], prevBrand: [], selCat: [], prevCat: [] };
    const max = new Date(maxDate);
    const cut = new Date(max); cut.setDate(cut.getDate() - range + 1);
    const prevCut = new Date(cut); prevCut.setDate(prevCut.getDate() - range);
    const cutS = cut.toISOString().slice(0, 10);
    const prevCutS = prevCut.toISOString().slice(0, 10);
    const inSel = (d: string) => d >= cutS;
    const inPrev = (d: string) => d >= prevCutS && d < cutS;
    return {
      sel: daily.filter((d) => inSel(d.date)),
      prev: daily.filter((d) => inPrev(d.date)),
      selBrand: brandDaily.filter((d) => inSel(d.date)),
      prevBrand: brandDaily.filter((d) => inPrev(d.date)),
      selCat: categoryDaily.filter((d) => inSel(d.date)),
      prevCat: categoryDaily.filter((d) => inPrev(d.date)),
    };
  }, [daily, brandDaily, categoryDaily, range, maxDate]);

  // ---- period metrics ----
  const metrics = (rows: DailyPoint[]) => {
    const total = rows.reduce((s, d) => s + d.total, 0);
    const pos = rows.reduce((s, d) => s + d.positive, 0);
    const neg = rows.reduce((s, d) => s + d.negative, 0);
    const urgent = rows.reduce((s, d) => s + d.urgent, 0);
    const rsum = rows.reduce((s, d) => s + (d.avg_rating ?? 0) * d.total, 0);
    return {
      total, urgent,
      score: total ? Math.round(((pos - neg) / total) * 1000) / 10 : 0,
      posRate: total ? Math.round((pos / total) * 100) : 0,
      avgRating: total ? Math.round((rsum / total) * 100) / 100 : 0,
    };
  };
  const cur = metrics(sel);
  const prv = metrics(prev);
  const hasPrev = prev.length > 0;

  // ---- brand period score (weighted) ----
  const brandScore = (rows: BrandDaily[]) => {
    const m = new Map<string, { ws: number; t: number; urgent: number }>();
    for (const r of rows) {
      const e = m.get(r.brand) || { ws: 0, t: 0, urgent: 0 };
      e.ws += r.score * r.total; e.t += r.total; e.urgent += r.urgent;
      m.set(r.brand, e);
    }
    const out = new Map<string, { score: number; total: number; urgent: number }>();
    for (const [b, e] of m) out.set(b, { score: e.t ? Math.round((e.ws / e.t) * 10) / 10 : 0, total: e.t, urgent: e.urgent });
    return out;
  };
  const curBrand = useMemo(() => brandScore(selBrand), [selBrand]);
  const prvBrand = useMemo(() => brandScore(prevBrand), [prevBrand]);

  // ---- auto insights ----
  const insights = useMemo(() => {
    const out: { icon: string; text: string; tone: "good" | "bad" | "info" }[] = [];
    // overall score
    if (hasPrev) {
      const d = Math.round((cur.score - prv.score) * 10) / 10;
      if (Math.abs(d) >= 1)
        out.push({ icon: d > 0 ? "📈" : "📉", tone: d > 0 ? "good" : "bad", text: `คะแนนทิศทางรวม ${d > 0 ? "ดีขึ้น" : "แย่ลง"} ${Math.abs(d)} จุด เทียบช่วงก่อน (${fmtScore(prv.score)} → ${fmtScore(cur.score)})` });
      const vol = prv.total ? Math.round(((cur.total - prv.total) / prv.total) * 100) : 0;
      if (Math.abs(vol) >= 15)
        out.push({ icon: "💬", tone: "info", text: `ปริมาณคอมเมนต์ ${vol > 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(vol)}% (${prv.total.toLocaleString("th-TH")} → ${cur.total.toLocaleString("th-TH")})` });
    }
    // brand movers
    if (hasPrev) {
      const moves: { brand: string; d: number }[] = [];
      for (const [b, e] of curBrand) {
        const p = prvBrand.get(b);
        if (p && e.total >= 10 && p.total >= 10) moves.push({ brand: b, d: Math.round((e.score - p.score) * 10) / 10 });
      }
      moves.sort((a, b) => a.d - b.d);
      if (moves.length && moves[0].d <= -3) out.push({ icon: "⚠️", tone: "bad", text: `แบรนด์ "${moves[0].brand}" คะแนนดิ่งสุด ${moves[0].d} จุด — ควรตรวจสอบ` });
      const up = moves[moves.length - 1];
      if (up && up.d >= 3) out.push({ icon: "🏆", tone: "good", text: `แบรนด์ "${up.brand}" พุ่งสุด +${up.d} จุด` });
    }
    // rising issue
    const sumCat = (rows: CatDaily[]) => { const m = new Map<string, number>(); for (const r of rows) m.set(r.category, (m.get(r.category) || 0) + r.total); return m; };
    const cc = sumCat(selCat), pc = sumCat(prevCat);
    let rise: { cat: string; cur: number; prev: number; pct: number } | null = null;
    for (const [cat, n] of cc) {
      const p = pc.get(cat) || 0;
      const pct = p ? Math.round(((n - p) / p) * 100) : n >= 5 ? 999 : 0;
      if (n >= 5 && (!rise || pct > rise.pct)) rise = { cat, cur: n, prev: p, pct };
    }
    if (rise && rise.pct >= 25) out.push({ icon: "🔧", tone: "bad", text: `ปัญหา "${rise.cat}" เพิ่มขึ้น ${rise.pct === 999 ? "ใหม่" : rise.pct + "%"} (${rise.prev} → ${rise.cur} ครั้ง)` });
    // top issue overall
    const topCat = [...cc.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCat) out.push({ icon: "📋", tone: "info", text: `หมวดปัญหาที่พบบ่อยสุด: "${topCat[0]}" ${topCat[1]} ครั้ง` });
    // product alert
    const prodAlert = [...products].filter((p) => p.total >= 3).sort((a, b) => b.urgent_count - a.urgent_count || a.sentiment_score - b.sentiment_score)[0];
    if (prodAlert && (prodAlert.urgent_count > 0 || prodAlert.sentiment_score < 0))
      out.push({ icon: "🚨", tone: "bad", text: `สินค้าน่าห่วง: "${(prodAlert.item_name || prodAlert.product_name).slice(0, 40)}" (คะแนน ${fmtScore(prodAlert.sentiment_score)}, ด่วน ${prodAlert.urgent_count})` });
    // spike day
    if (sel.length >= 4) {
      const mean = sel.reduce((s, d) => s + d.urgent, 0) / sel.length;
      const sd = Math.sqrt(sel.reduce((s, d) => s + (d.urgent - mean) ** 2, 0) / sel.length);
      const spike = [...sel].sort((a, b) => b.urgent - a.urgent)[0];
      if (sd > 0 && spike.urgent > mean + 2 * sd && spike.urgent >= 3)
        out.push({ icon: "📛", tone: "bad", text: `พบวันที่คอมเมนต์ด่วนพุ่งผิดปกติ: ${spike.date} (${spike.urgent} รายการ)` });
    }
    // best/worst day
    const valid = sel.filter((d) => d.total >= 3);
    if (valid.length >= 2) {
      const best = [...valid].sort((a, b) => b.score - a.score)[0];
      const worst = [...valid].sort((a, b) => a.score - b.score)[0];
      out.push({ icon: "📅", tone: "info", text: `วันคะแนนดีสุด ${best.date} (${fmtScore(best.score)}) • แย่สุด ${worst.date} (${fmtScore(worst.score)})` });
    }
    return out;
  }, [cur, prv, hasPrev, curBrand, prvBrand, selCat, prevCat, sel, products]);

  // ---- chart data ----
  const volScore = sel.map((d) => ({ date: d.date.slice(5), score: d.score, total: d.total }));
  const ratingSeries = sel.map((d) => ({ date: d.date.slice(5), rating: d.avg_rating }));

  const topBrands = useMemo(() => [...curBrand.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6).map(([b]) => b), [curBrand]);
  const brandSeries = useMemo(() => {
    const dates = Array.from(new Set(selBrand.map((d) => d.date))).sort();
    const map = new Map<string, Record<string, number>>();
    for (const r of selBrand) {
      if (!topBrands.includes(r.brand)) continue;
      const row = map.get(r.date) || {};
      row[r.brand] = r.score; map.set(r.date, row);
    }
    return dates.map((dt) => ({ date: dt.slice(5), ...(map.get(dt) || {}) }));
  }, [selBrand, topBrands]);

  const topCats = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of selCat) m.set(r.category, (m.get(r.category) || 0) + r.total);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  }, [selCat]);
  const catSeries = useMemo(() => {
    const dates = Array.from(new Set(selCat.map((d) => d.date))).sort();
    const map = new Map<string, Record<string, number>>();
    for (const r of selCat) {
      if (!topCats.includes(r.category)) continue;
      const row = map.get(r.date) || {};
      row[r.category] = (row[r.category] || 0) + r.total; map.set(r.date, row);
    }
    return dates.map((dt) => ({ date: dt.slice(5), ...Object.fromEntries(topCats.map((c) => [c, (map.get(dt) || {})[c] || 0])) }));
  }, [selCat, topCats]);

  if (!maxDate) return <div className="p-7"><div className="card card-pad text-muted">ยังไม่มีข้อมูลเทรนด์ — รัน pipeline ก่อน</div></div>;

  return (
    <div className="px-7 pt-5 pb-16 max-w-[1680px] mx-auto">
      {/* range selector */}
      <div className="flex items-center gap-1.5 mb-4">
        {RANGES.map((r) => (
          <button key={r} onClick={() => setRange(r)} className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border ${range === r ? "bg-shopee text-white border-shopee" : "bg-white border-line hover:bg-slate-50"}`}>
            {r} วัน
          </button>
        ))}
        <span className="text-muted text-[12.5px] ml-2">ถึง {maxDate}</span>
      </div>

      {/* KPI with WoW */}
      <div className="grid gap-4 mb-5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <KpiDelta label="คะแนนทิศทาง" value={fmtScore(cur.score)} delta={hasPrev ? Math.round((cur.score - prv.score) * 10) / 10 : null} color={dirColor(cur.score)} />
        <KpiDelta label="คอมเมนต์" value={cur.total.toLocaleString("th-TH")} delta={hasPrev ? cur.total - prv.total : null} />
        <KpiDelta label="% เชิงบวก" value={cur.posRate + "%"} delta={hasPrev ? cur.posRate - prv.posRate : null} suffix="%" />
        <KpiDelta label="ดาวเฉลี่ย" value={String(cur.avgRating)} delta={hasPrev ? Math.round((cur.avgRating - prv.avgRating) * 100) / 100 : null} />
        <KpiDelta label="ด่วนรวม" value={cur.urgent.toLocaleString("th-TH")} delta={hasPrev ? cur.urgent - prv.urgent : null} invert />
      </div>

      {/* auto insights */}
      <div className="card card-pad mb-5">
        <h3 className="kpi-label mb-3">🧠 ข้อสังเกตอัตโนมัติ (AI insights)</h3>
        {insights.length === 0 ? (
          <div className="text-muted text-sm">ยังไม่มีข้อสังเกตเด่นในช่วงนี้</div>
        ) : (
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(330px,1fr))]">
            {insights.map((ins, i) => (
              <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg text-[13px] leading-snug ${ins.tone === "bad" ? "bg-neg-bg" : ins.tone === "good" ? "bg-pos-bg" : "bg-slate-50"}`}>
                <span className="text-base leading-none flex-none">{ins.icon}</span>
                <span className={ins.tone === "bad" ? "text-neg" : ins.tone === "good" ? "text-pos" : "text-ink"}>{ins.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* score + volume */}
      <ChartCard title="คะแนนทิศทาง + ปริมาณคอมเมนต์ (รายวัน)">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={volScore} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="l" domain={[-100, 100]} tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="r" orientation="right" tick={{ fill: "#cbd2da", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ec", fontSize: 12 }} />
            <Bar yAxisId="r" dataKey="total" name="จำนวน" fill="#eef0f3" radius={[3, 3, 0, 0]} />
            <Line yAxisId="l" type="monotone" dataKey="score" name="คะแนน" stroke="#4e7d63" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid gap-4 mt-4 [grid-template-columns:1fr_1fr] max-[900px]:grid-cols-1">
        <ChartCard title="เปรียบเทียบคะแนนแบรนด์ตามเวลา (Top 6)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={brandSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis domain={[-100, 100]} tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ec", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topBrands.map((b, i) => (
                <Line key={b} type="monotone" dataKey={b} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.8} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="เทรนด์หมวดปัญหา (Top 5, คอมเมนต์เชิงลบ)">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={catSeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ec", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {topCats.map((c, i) => (
                <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={LINE_COLORS[i % LINE_COLORS.length]} fill={LINE_COLORS[i % LINE_COLORS.length]} fillOpacity={0.25} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* brand movers table + rating */}
      <div className="grid gap-4 mt-4 [grid-template-columns:1.2fr_1fr] max-[900px]:grid-cols-1">
        <div className="card card-pad">
          <h3 className="kpi-label mb-3">การเปลี่ยนแปลงคะแนนรายแบรนด์ (vs ช่วงก่อน)</h3>
          <div className="space-y-1.5">
            {[...curBrand.entries()].filter(([, e]) => e.total >= 5).sort((a, b) => {
              const da = (a[1].score - (prvBrand.get(a[0])?.score ?? a[1].score));
              const db = (b[1].score - (prvBrand.get(b[0])?.score ?? b[1].score));
              return da - db;
            }).map(([b, e]) => {
              const p = prvBrand.get(b);
              const d = p ? Math.round((e.score - p.score) * 10) / 10 : null;
              return (
                <div key={b} className="flex items-center gap-3 text-[13px] py-1">
                  <div className="w-[120px] flex-none font-medium truncate">{b}</div>
                  <div className="flex-1 text-muted text-[12px]">{e.total} คอมเมนต์{e.urgent > 0 ? ` • ⚠${e.urgent}` : ""}</div>
                  <div className="w-12 text-right font-semibold" style={{ color: dirColor(e.score) }}>{fmtScore(e.score)}</div>
                  <div className={`w-16 text-right font-bold ${d == null ? "text-muted" : d > 0 ? "text-pos" : d < 0 ? "text-neg" : "text-muted"}`}>
                    {d == null ? "—" : (d > 0 ? "▲ +" : d < 0 ? "▼ " : "") + (d === 0 ? "0" : d)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <ChartCard title="แนวโน้มดาวเฉลี่ย (รายวัน)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={ratingSeries} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 5]} tick={{ fill: "#9aa1ad", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ec", fontSize: 12 }} />
              <Line type="monotone" dataKey="rating" name="ดาวเฉลี่ย" stroke="#d97706" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="text-center mt-6">
        <Link href="/api/export" className="inline-flex items-center gap-1.5 bg-white border border-line px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50">
          ⬇ ส่งออกคอมเมนต์ทั้งหมด (CSV)
        </Link>
      </div>
    </div>
  );
}

function KpiDelta({ label, value, delta, color, suffix, invert }: { label: string; value: string; delta: number | null; color?: string; suffix?: string; invert?: boolean }) {
  const good = delta == null ? false : invert ? delta < 0 : delta > 0;
  const bad = delta == null ? false : invert ? delta > 0 : delta < 0;
  return (
    <div className="card card-pad">
      <div className="kpi-label">{label}</div>
      <div className="text-[26px] font-extrabold mt-1" style={color ? { color } : undefined}>{value}</div>
      {delta != null && (
        <div className={`text-[12px] font-semibold mt-0.5 ${good ? "text-pos" : bad ? "text-neg" : "text-muted"}`}>
          {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : ""}{delta === 0 ? "ไม่เปลี่ยน" : delta + (suffix || "")} <span className="text-muted font-normal">vs ช่วงก่อน</span>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <h3 className="kpi-label mb-3">{title}</h3>
      {children}
    </div>
  );
}
