"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { autoForecast } from "@/lib/forecast-models";
import {
  demandPattern, envDrivers, envRegression, monthlyForecast, stockScience, whyThisMonth,
  type EnvMonthly, type ProductCatalogRow, type StockStatus,
} from "@/lib/product-analytics";
import { lifecycleStage, priceElasticity } from "@/lib/price-elasticity";
import { categorize } from "@/lib/product-category";
import { sentimentLeadingIndicator, type SentimentDayIn } from "@/lib/sentiment-signal";
import { avgUnitPrice, lostSalesRisk, reconstructDemand } from "@/lib/stock-risk";
import AiBrief from "./AiBrief";
import { Alert, Box, Info, Trend } from "./icons";

interface EnvDay { date: string; pm2_5: number | null; temp_mean: number | null; temp_max: number | null; precip: number | null }
interface StockDay { date: string; stock: number | null; reserved: number | null }
const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const LEAD_OPTS = [7, 14, 30, 45];
const SERVICE_OPTS = [90, 95, 99];
const num = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("th-TH"));
const shortDate = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;
const STATUS_COLOR: Record<StockStatus, string> = { urgent: "#ef4444", soon: "#f59e0b", ok: "#16a34a", overstock: "#3b82f6", dead: "#a855f7", nostock: "#94a3b8" };

interface MlForecast { meta: { model: string; wape: number | null; n_history: number | null; horizon: number | null; generated_at: string } | null; points: { date: string; yhat: number; lower: number; upper: number }[] }

export default function StockDetailClient({ product, demand, envMonthly, envDaily, stockHistory = [], sentiment = [], ml }: { product: ProductCatalogRow; demand: { date: string; units: number; gmv: number }[]; envMonthly: EnvMonthly[]; envDaily: EnvDay[]; stockHistory?: StockDay[]; sentiment?: SentimentDayIn[]; ml?: MlForecast }) {
  const [lead, setLead] = useState(14);
  const [service, setService] = useState(95);

  // จำแนกประเภทสินค้า → เลือกปัจจัยพยากรณ์ที่เกี่ยวข้องจริง
  const cat = useMemo(() => categorize(product.name, product.brand), [product.name, product.brand]);

  // วิทยาศาสตร์สต๊อก
  const sci = useMemo(() => stockScience(demand, lead, product.stock, 90), [demand, lead, product.stock]);
  const pattern = useMemo(() => demandPattern(demand), [demand]);
  const reg = useMemo(() => envRegression(demand, envDaily, cat.weatherFactors, cat.label), [demand, envDaily, cat]);

  const svcRow = sci.table.find((r) => r.service === service) ?? sci.table[1];
  const daysOfCover = product.stock != null && sci.meanDaily > 0 ? Math.round(product.stock / sci.meanDaily) : null;
  const status: StockStatus = product.stock == null ? "nostock"
    : sci.meanDaily <= 0 ? (product.stock > 0 ? "dead" : "nostock")
    : daysOfCover != null && daysOfCover <= lead ? "urgent"
    : daysOfCover != null && daysOfCover <= lead * 2 ? "soon"
    : daysOfCover != null && daysOfCover >= 120 ? "overstock" : "ok";
  const recommendedQty = Math.max(0, Math.ceil(sci.meanDaily * (lead + 30) + svcRow.safety - (product.stock ?? 0)));

  // แก้ "ดีมานด์ถูกบดบัง" (วันของหมด) ก่อนพยากรณ์ — ใช้ประวัติสต๊อกถ้ามี
  const recon = useMemo(() => {
    const stockBy = new Map(stockHistory.map((s) => [s.date, s.stock]));
    return reconstructDemand(demand.map((d) => ({ date: d.date, units: d.units })), stockBy.size ? stockBy : undefined);
  }, [demand, stockHistory]);

  // พยากรณ์ดีมานด์รายวัน 30 วัน — เลือกโมเดลอัตโนมัติ (บนดีมานด์ที่แก้การบดบังแล้ว)
  const auto = useMemo(() => {
    const src = recon ? recon.series.map((d) => ({ date: d.date, value: d.units })) : demand.map((d) => ({ date: d.date, value: d.units }));
    return autoForecast(src, 30, true);
  }, [demand, recon]);

  const mlMap = useMemo(() => new Map((ml?.points ?? []).map((p) => [p.date, p])), [ml]);
  const daily = useMemo(() => {
    if (!auto) return [] as { date: string; actual: number | null; forecast: number; ml: number | null; isFuture: boolean }[];
    const hist = auto.points.filter((p) => !p.isFuture).slice(-120);
    const fut = auto.points.filter((p) => p.isFuture);
    return [...hist, ...fut].map((p) => ({ date: p.date, actual: p.actual, forecast: Math.max(0, Math.round(p.forecast)), ml: mlMap.has(p.date) ? Math.round(mlMap.get(p.date)!.yhat) : null, isFuture: p.isFuture }));
  }, [auto, mlMap]);
  const hasMl = !!ml?.meta && (ml?.points.length ?? 0) > 0;
  const firstFuture = daily.find((d) => d.isFuture)?.date;
  const fcNext30 = auto?.forecastSum ?? 0;

  // ยอดขายที่เสียจากของหมด (lost sales / revenue-at-risk)
  const unitPrice = useMemo(() => avgUnitPrice(demand), [demand]);
  const lost = useMemo(() => {
    if (!auto) return null;
    const fut = auto.points.filter((p) => p.isFuture).map((p) => ({ date: p.date, units: p.forecast }));
    return lostSalesRisk(fut, product.stock, lead, unitPrice);
  }, [auto, product.stock, lead, unitPrice]);

  // สัญญาณนำจากรีวิว/คอมเมนต์
  const signal = useMemo(() => sentimentLeadingIndicator(demand.map((d) => ({ date: d.date, units: d.units })), sentiment), [demand, sentiment]);

  // ความยืดหยุ่นของราคา + ระยะวงจรชีวิต
  const elast = useMemo(() => priceElasticity(demand), [demand]);
  const life = useMemo(() => lifecycleStage(demand.map((d) => ({ date: d.date, units: d.units }))), [demand]);

  // รายเดือน
  const monthly = useMemo(() => monthlyForecast(demand.map((d) => ({ date: d.date, units: d.units })), 12), [demand]);
  const drivers = useMemo(() => envDrivers(monthly, envMonthly, cat.weatherFactors), [monthly, envMonthly, cat]);
  const why = useMemo(() => whyThisMonth(monthly, envMonthly, drivers), [monthly, envMonthly, drivers]);
  const monthlyChart = monthly.map((p) => ({ month: p.month, units: p.units, isForecast: p.isForecast }));
  const fcNextYear = monthly.filter((m) => m.isForecast).reduce((s, m) => s + m.units, 0);

  return (
    <div className="px-7 pt-5 pb-16 max-w-[1680px]">
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Link href="/stock" className="text-shopee text-[13px] font-semibold">← กลับรายการสินค้า</Link>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted font-semibold">เวลาสั่งของ (วัน)</span>
          <div className="inline-flex rounded-lg border border-line overflow-hidden bg-white">
            {LEAD_OPTS.map((l) => <button key={l} onClick={() => setLead(l)} className={`text-[12px] px-2.5 py-1.5 ${lead === l ? "bg-shopee text-white" : "text-ink hover:bg-slate-50"}`}>{l}</button>)}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted font-semibold">ระดับบริการ</span>
          <div className="inline-flex rounded-lg border border-line overflow-hidden bg-white">
            {SERVICE_OPTS.map((s) => <button key={s} onClick={() => setService(s)} className={`text-[12px] px-2.5 py-1.5 ${service === s ? "bg-shopee text-white" : "text-ink hover:bg-slate-50"}`}>{s}%</button>)}
          </div>
        </div>
        <Link href={`/products/${product.product_id}`} className="ml-auto text-[12.5px] text-shopee font-semibold">ดูรีวิวสินค้านี้ →</Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[560px]:grid-cols-1 mb-4">
        <Kpi label="สต๊อกคงเหลือ" value={num(product.stock)} sub={product.reserved ? `จองอยู่ ${num(product.reserved)}` : product.stock == null ? "ไม่มีข้อมูล" : "ชิ้น"} icon={<Box className="w-4 h-4" />} />
        <Kpi label="วันคงเหลือ (cover)" value={daysOfCover == null ? "-" : `${daysOfCover} วัน`} sub={sci.stockoutRisk != null ? `เสี่ยงขาด ${sci.stockoutRisk}%` : "—"} color={STATUS_COLOR[status]} />
        <Kpi label="แนะนำสั่งเพิ่ม" value={recommendedQty > 0 ? "+" + num(recommendedQty) : "พอแล้ว"} sub={`จุดสั่งซื้อ ${num(svcRow.reorderPoint)} ชิ้น @${service}%`} icon={<Alert className="w-4 h-4" />} color={recommendedQty > 0 ? "#ea580c" : "#16a34a"} />
        <Kpi label="คาดดีมานด์ 30 วัน" value={num(fcNext30) + " ชิ้น"} sub={`ทั้งปี ~${num(fcNextYear)} ชิ้น`} icon={<Trend className="w-4 h-4" />} color="#6366f1" />
      </div>

      {(why || status === "urgent" || status === "dead" || (recon && recon.stockoutDays.length > 0)) && (
        <div className="card card-pad space-y-1.5 mb-4">
          {status === "urgent" && <div className="flex items-start gap-2 text-[13.5px] text-neg"><Alert className="w-4 h-4 flex-none mt-0.5" /><span>สต๊อกใกล้หมด — เหลือพอขายอีก ~{daysOfCover} วัน (น้อยกว่าเวลาสั่งของ {lead} วัน) ควรรีบสั่งเพิ่ม {num(recommendedQty)} ชิ้น</span></div>}
          {status === "dead" && <div className="flex items-start gap-2 text-[13.5px] text-purple-700"><Info className="w-4 h-4 flex-none mt-0.5" /><span>สินค้าค้างสต๊อก — มีของ {num(product.stock)} ชิ้นแต่แทบไม่มียอดขาย ควรทำโปร/ระบายสต๊อก</span></div>}
          {recon && recon.stockoutDays.length > 0 && <div className="flex items-start gap-2 text-[13.5px] text-amber-700"><Info className="w-4 h-4 flex-none mt-0.5" /><span>{recon.note} — พยากรณ์นี้ปรับชดเชยวันของหมดแล้ว ({recon.method === "stock_history" ? "อิงประวัติสต๊อก" : "ประเมินจากรูปแบบการขาย"})</span></div>}
          {why && <div className="flex items-start gap-2 text-[13.5px] text-ink"><Info className="w-4 h-4 flex-none mt-0.5 text-shopee" /><span>{why}</span></div>}
        </div>
      )}

      {/* ป้ายประเภทสินค้า + ปัจจัยที่ระบบเลือกใช้พยากรณ์ */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3 py-1 text-[12px] font-semibold">🏷️ ประเภท: {cat.label}</span>
        {life && <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 text-[12px] font-semibold">🔄 {life.stage}</span>}
        <span className="text-[12.5px] text-muted">{cat.driverHint}</span>
      </div>

      {/* กราฟหลัก 2 คอลัมน์ */}
      <GroupTitle>ภาพรวมการพยากรณ์</GroupTitle>
      <div className="grid grid-cols-2 gap-4 max-[1100px]:grid-cols-1">
        <div className="card card-pad">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="text-[15px] font-bold text-ink flex items-center gap-2"><Trend className="w-4 h-4 text-shopee" /> ยอดขายรายวัน + พยากรณ์ 30 วัน (ชิ้น)</h3>
            {hasMl
              ? <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 text-sky-700 px-2.5 py-1 text-[11.5px] font-semibold">🧠 ML (Nixtla): {ml!.meta!.model}{ml!.meta!.wape != null ? ` • แม่น ${Math.max(0, 100 - ml!.meta!.wape).toFixed(0)}%` : ""}</span>
              : <span className="text-[11px] text-muted">เส้น ML (Nixtla) ยังไม่มี — รัน <code className="bg-slate-100 px-1 rounded">python ml/forecast_ml.py</code></span>}
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={daily} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#8a93a3" }} minTickGap={36} />
              <YAxis tick={{ fontSize: 11, fill: "#8a93a3" }} width={36} allowDecimals={false} />
              <Tooltip formatter={(v: unknown, n: string) => [v == null ? "-" : Math.round(Number(v)), n === "actual" ? "ขายจริง" : n === "ml" ? "ML (Nixtla)" : "พยากรณ์ในแอป"]} labelFormatter={(d) => `วันที่ ${d}`} contentStyle={{ borderRadius: 12, border: "1px solid #e6e8ec", fontSize: 12.5 }} />
              {firstFuture && <ReferenceLine x={firstFuture} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "วันนี้", fontSize: 10, fill: "#64748b", position: "insideTopRight" }} />}
              <Area type="monotone" dataKey="forecast" name="forecast" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 4" fill="#6366f1" fillOpacity={0.08} isAnimationActive={false} />
              {hasMl && <Line type="monotone" dataKey="ml" name="ml" stroke="#0ea5e9" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls />}
              <Line type="monotone" dataKey="actual" name="actual" stroke="#16a34a" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
          {hasMl && <p className="text-[11px] text-muted mt-2">เส้นฟ้า = พยากรณ์ ML (Nixtla, แบบ M5) • เส้นม่วงประ = พยากรณ์ในแอป • อัปเดตล่าสุด {ml!.meta!.generated_at?.slice(0, 10)}</p>}
        </div>

        <div className="card card-pad">
          <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-1"><Box className="w-4 h-4 text-shopee" /> ดีมานด์รายเดือน + พยากรณ์ 12 เดือน</h3>
          <p className="text-[12px] text-muted mb-3">แท่งทึบ = ขายจริง • แท่งจาง = พยากรณ์ (เทรนด์ × ฤดูกาล)</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyChart} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="month" tickFormatter={(m) => m.slice(2)} tick={{ fontSize: 10, fill: "#8a93a3" }} minTickGap={14} />
              <YAxis tick={{ fontSize: 11, fill: "#8a93a3" }} width={36} allowDecimals={false} />
              <Tooltip formatter={(v: unknown) => [Math.round(Number(v)) + " ชิ้น", "ยอดขาย"]} contentStyle={{ borderRadius: 12, border: "1px solid #e6e8ec", fontSize: 12.5 }} />
              <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                {monthlyChart.map((d, i) => <Cell key={i} fill={d.isForecast ? "#c7d2fe" : "#6366f1"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* กลุ่ม 1: ความแม่นพยากรณ์ & ความเสี่ยงของหมด */}
      <GroupTitle>ความแม่นพยากรณ์ & ความเสี่ยงของหมด</GroupTitle>
      <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
          {/* ความแม่นโมเดล + โมเดลที่เลือกอัตโนมัติ */}
          <RailCard title="โมเดลที่เลือก & ความแม่น" icon={<Trend className="w-4 h-4 text-shopee" />}>
            {auto ? (
              <>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-1 text-[11.5px] font-semibold mb-2">🤖 {auto.modelLabel}</div>
                {auto.backtest && auto.backtest.wape != null ? (
                  <>
                    <div className="flex items-baseline gap-2"><span className="text-[28px] font-extrabold text-ink leading-none">{Math.max(0, 100 - auto.backtest.wape).toFixed(0)}%</span><span className="text-[12px] text-muted">ความแม่น (จาก WAPE)</span></div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
                      <Metric label="WAPE" value={auto.backtest.wape + "%"} hint="ยิ่งต่ำยิ่งดี" />
                      <Metric label="MAPE" value={auto.backtest.mape == null ? "-" : auto.backtest.mape + "%"} />
                      <Metric label="อคติ (Bias)" value={(auto.backtest.bias > 0 ? "+" : "") + auto.backtest.bias + "%"} hint={auto.backtest.bias > 5 ? "พยากรณ์สูงไป" : auto.backtest.bias < -5 ? "พยากรณ์ต่ำไป" : "สมดุล"} />
                      <Metric label="เกรด" value={auto.backtest.wape <= 20 ? "แม่นยำสูง" : auto.backtest.wape <= 35 ? "ดี" : auto.backtest.wape <= 50 ? "พอใช้" : "ควรระวัง"} />
                    </div>
                  </>
                ) : <p className="text-[12px] text-muted">ข้อมูลยังไม่พอวัดความแม่นย้อนหลัง</p>}
                <p className="text-[11.5px] text-muted mt-2 leading-relaxed">{auto.why}</p>
                {auto.candidates.filter((c) => c.wape != null).length > 1 && (
                  <div className="mt-2 pt-2 border-t border-[#f1f3f5]">
                    <p className="text-[10.5px] text-muted mb-1">เทียบโมเดล (WAPE ยิ่งต่ำยิ่งดี):</p>
                    <div className="space-y-0.5">
                      {auto.candidates.filter((c) => c.wape != null).map((c) => (
                        <div key={c.kind} className={`flex justify-between text-[11px] ${c.kind === auto.model ? "font-bold text-shopee" : "text-muted"}`}>
                          <span>{c.label}{c.kind === auto.model ? " ✓" : ""}</span><span>{c.wape}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : <Empty />}
          </RailCard>

          {/* ยอดขายที่เสียจากของหมด */}
          <RailCard title="ยอดขายที่เสี่ยงเสียจากของหมด" icon={<Alert className="w-4 h-4 text-orange-500" />}>
            {lost ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[26px] font-extrabold leading-none" style={{ color: lost.lostUnits > 0 ? "#ea580c" : "#16a34a" }}>{lost.lostUnits > 0 ? baht(lost.lostRevenue) : "฿0"}</span>
                  <span className="text-[12px] text-muted">เสี่ยงเสียใน {lead} วัน</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
                  <Metric label="ของหมดในอีก" value={lost.coverDays == null ? "ไม่หมด" : lost.coverDays + " วัน"} hint={lost.stockoutDate ? `~${shortDate(lost.stockoutDate)}` : "พอตลอดช่วง"} />
                  <Metric label="ขายไม่ได้" value={lost.lostUnits > 0 ? lost.lostUnits + " ชิ้น" : "0"} hint={`ถ้าสั่งวันนี้ (lead ${lead}ว)`} />
                  <Metric label="ดีมานด์ช่วง lead" value={lost.demandLeadTime + " ชิ้น"} hint={`ราคา/ชิ้น ${baht(lost.unitPrice)}`} />
                  <Metric label="เสี่ยงทั้งช่วง" value={lost.horizonAtRiskUnits > 0 ? baht(lost.horizonAtRiskRevenue) : "฿0"} hint="ถ้าไม่สั่งเลย 30 วัน" />
                </div>
                <p className="text-[11.5px] mt-2 leading-relaxed" style={{ color: lost.level === "high" ? "#c2410c" : "#64748b" }}>
                  {lost.level === "high" ? `⚠ ของจะหมดก่อนของใหม่มาถึง — รีบสั่งเพื่อกันยอดหาย ~${baht(lost.lostRevenue)}` : lost.level === "low" ? "เริ่มตึง — วางแผนสั่งให้ทันรอบ lead time" : "สต๊อกพอรองรับช่วง lead time"}
                </p>
              </>
            ) : <Empty msg="ไม่มีข้อมูลสต๊อก/พยากรณ์พอคำนวณ" />}
          </RailCard>
      </div>

      {/* กลุ่ม 2: รูปแบบดีมานด์ • สัญญาณรีวิว • สต๊อก */}
      <GroupTitle>รูปแบบดีมานด์ • สัญญาณรีวิว • สต๊อก</GroupTitle>
      <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[680px]:grid-cols-1">
          {/* สัญญาณนำจากรีวิว */}
          <RailCard title="สัญญาณนำจากรีวิว" icon={<Info className="w-4 h-4 text-shopee" />}>
            {signal ? (
              <>
                {signal.headline ? (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[22px] font-extrabold text-ink leading-none">{signal.headline.bestLagWeeks === 0 ? "พร้อมกัน" : `นำ ${signal.headline.bestLagWeeks} สัปดาห์`}</span>
                    <span className="text-[12px] text-muted">corr {signal.headline.corr}</span>
                  </div>
                ) : <div className="text-[14px] font-bold text-muted">ยังไม่พบสัญญาณชัด</div>}
                <div className="space-y-1.5 mt-3">
                  {signal.signals.map((s) => {
                    const col = s.strength === "สูง" ? "#16a34a" : s.strength === "ปานกลาง" ? "#f59e0b" : "#94a3b8";
                    return (
                      <div key={s.signal} className="flex items-center gap-2">
                        <span className="w-24 text-[12px] text-ink">{s.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(s.corr) * 100)}%`, background: col }} /></div>
                        <span className="w-16 text-right text-[11px] font-semibold" style={{ color: col }}>{s.bestLagWeeks > 0 ? `+${s.bestLagWeeks}w` : "0w"} {s.corr}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[12px] text-muted mt-2 leading-relaxed">{signal.note}</p>
                <p className="text-[10.5px] text-muted mt-1">จากรีวิว {signal.totalReviews} รายการ • {signal.weeks} สัปดาห์</p>
              </>
            ) : <Empty msg="รีวิวยังน้อยเกินวิเคราะห์ (ต้อง ≥12 รายการ)" />}
          </RailCard>

          {/* รูปแบบดีมานด์ */}
          <RailCard title="รูปแบบดีมานด์" icon={<Info className="w-4 h-4 text-shopee" />}>
            {pattern ? (
              <>
                <div className="text-[15px] font-bold text-ink">{pattern.klass}</div>
                <div className="flex gap-4 mt-2 text-[12px]">
                  <Metric label="ADI" value={String(pattern.adi)} hint="ความถี่การขาย" />
                  <Metric label="CV²" value={String(pattern.cv2)} hint="ความแกว่ง" />
                  <Metric label="คาดการณ์" value={pattern.predictability} />
                </div>
                <p className="text-[12px] text-muted mt-2 leading-relaxed">{pattern.note}</p>
              </>
            ) : <Empty />}
          </RailCard>

          {/* Safety stock ตามระดับบริการ */}
          <RailCard title="จุดสั่งซื้อตามระดับบริการ" icon={<Box className="w-4 h-4 text-shopee" />}>
            <p className="text-[11.5px] text-muted mb-2">เฉลี่ยขาย {sci.meanDaily}/วัน • ผันผวน (SD) {sci.sigmaDaily} • lead {lead} วัน</p>
            <table className="w-full text-[12.5px]">
              <thead><tr className="text-muted text-[11px]"><th className="text-left font-semibold pb-1">บริการ</th><th className="text-right font-semibold pb-1">Safety</th><th className="text-right font-semibold pb-1">จุดสั่งซื้อ</th></tr></thead>
              <tbody>
                {sci.table.map((r) => (
                  <tr key={r.service} className={r.service === service ? "font-bold text-shopee" : "text-ink"}>
                    <td className="py-0.5">{r.service}%{r.service === sci.recommendedService ? " ★" : ""}</td>
                    <td className="text-right py-0.5">{num(r.safety)}</td>
                    <td className="text-right py-0.5">{num(r.reorderPoint)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-muted mt-2">★ แนะนำตามความผันผวนของสินค้านี้ • Safety = z×SD×√lead</p>
          </RailCard>
      </div>

      {/* กลุ่ม 3: ปัจจัยขับเคลื่อนยอดขาย (ราคา + อากาศ) */}
      <GroupTitle>ปัจจัยขับเคลื่อนยอดขาย</GroupTitle>
      <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
          {/* ความยืดหยุ่นของราคา + โปรโมชั่น */}
          <RailCard title="ราคา & ความไวต่อโปรโมชั่น" icon={<Trend className="w-4 h-4 text-shopee" />}>
            {elast ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[20px] font-extrabold text-ink leading-none">{elast.sensitivity}</span>
                  {elast.significant && <span className="text-[12px] text-muted">elasticity {elast.elasticity}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
                  <Metric label="ราคาเฉลี่ย/ชิ้น" value={baht(elast.avgPrice)} hint={`ช่วง ${baht(elast.minPrice)}–${baht(elast.maxPrice)}`} />
                  <Metric label="ลดราคา → ยอด" value={elast.promoLiftPct == null ? "-" : (elast.promoLiftPct > 0 ? "+" : "") + elast.promoLiftPct + "%"} hint="วันลดราคา vs ปกติ" />
                </div>
                <p className="text-[12px] text-muted mt-2 leading-relaxed">{elast.note}</p>
                <p className="text-[12px] text-shopee mt-1.5 leading-relaxed font-medium">→ {elast.recommendation}</p>
              </>
            ) : <Empty msg="ข้อมูลราคา/ยอดขายยังไม่พอประเมิน (ต้อง ≥30 วันที่ขายได้)" />}
          </RailCard>

          {/* ปัจจัยขับเคลื่อนยอดขาย — เลือกตามประเภทสินค้า + ทดสอบนัยสำคัญ */}
          <RailCard title="ปัจจัยขับเคลื่อนยอดขาย" icon={<Info className="w-4 h-4 text-shopee" />}>
            {!reg ? <Empty msg="ข้อมูลยังไม่พอ (ต้องมี ≥10 สัปดาห์)" /> : !reg.weatherRelevant ? (
              <>
                <div className="text-[16px] font-bold text-ink">ไม่ขึ้นกับสภาพอากาศ</div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-ink px-2.5 py-1 text-[11.5px] font-semibold mt-2">
                  {reg.trendBeta >= 0 ? "📈 แนวโน้มขาขึ้น" : "📉 แนวโน้มขาลง"}{reg.trendSignificant ? " (มีนัยสำคัญ)" : ""}
                </div>
                <p className="text-[12px] text-muted mt-2.5 leading-relaxed">{reg.summary}</p>
                <p className="text-[10.5px] text-muted mt-1.5">ระบบไม่ใส่ปัจจัยอากาศให้สินค้าประเภทนี้ เพราะไม่มีเหตุผลเชิงสาเหตุ (กัน correlation ลวง)</p>
              </>
            ) : reg.significantDrivers.length > 0 ? (
              <>
                <div className="flex items-baseline gap-2"><span className="text-[22px] font-extrabold text-ink leading-none">R² {Math.round(reg.adjR2 * 100)}%</span><span className="text-[11px] text-muted">อธิบายได้ (adj)</span></div>
                <div className="space-y-1.5 mt-3">
                  {reg.terms.map((t) => {
                    const col = !t.significant ? "#cbd5e1" : Math.abs(t.beta) >= 0.3 ? "#16a34a" : "#f59e0b";
                    return (
                      <div key={t.factor} className="flex items-center gap-2">
                        <span className="w-20 text-[12px] text-ink">{t.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${t.significant ? Math.min(100, Math.abs(t.beta) * 100) : 0}%`, background: col }} /></div>
                        <span className="w-16 text-right text-[11px] font-semibold" style={{ color: col }}>{t.significant ? `${t.beta >= 0 ? "+" : ""}${t.beta}` : "n.s."}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[12px] text-muted mt-2 leading-relaxed">{reg.summary}</p>
                <p className="text-[10.5px] text-muted mt-1">n.s. = ไม่มีนัยสำคัญ (|t|&lt;2) • จาก {reg.n} สัปดาห์</p>
              </>
            ) : (
              <>
                <div className="text-[16px] font-bold text-ink">อากาศไม่มีผลชัด</div>
                <p className="text-[12px] text-muted mt-2 leading-relaxed">{reg.summary}</p>
                <div className="space-y-1 mt-2.5">
                  {reg.terms.map((t) => (
                    <div key={t.factor} className="flex justify-between text-[11.5px] text-muted"><span>{t.label}</span><span>t={t.t} • ไม่สำคัญ</span></div>
                  ))}
                </div>
                <p className="text-[10.5px] text-muted mt-1.5">ทดสอบแล้วไม่ผ่านนัยสำคัญ — ระบบจึงไม่นำไปใช้พยากรณ์</p>
              </>
            )}
          </RailCard>
      </div>

      {/* บทวิเคราะห์ AI — รวมทุกสัญญาณเป็นบทความสั้น */}
      <div className="mt-7">
        <AiBrief
          kind="product"
          title={`${product.name || product.product_id} (${product.brand || "-"})`}
          facts={{
            ประเภทสินค้า: cat.label,
            ระยะวงจรชีวิต: life ? { stage: life.stage, อายุวัน: life.ageDays, เทียบพีค: life.recentVsPeakPct + "%" } : null,
            สต๊อก: { คงเหลือ: product.stock, วันคงเหลือ: daysOfCover, สถานะ: status, เสี่ยงขาดสต๊อกเปอร์เซ็นต์: sci.stockoutRisk, แนะนำสั่งเพิ่ม: recommendedQty, เวลาสั่งของวัน: lead },
            พยากรณ์ดีมานด์: { โมเดลที่เลือก: auto?.modelLabel, เหตุผล: auto?.why, ความแม่นWAPE: auto?.backtest?.wape, ชิ้น30วัน: fcNext30, ชิ้นทั้งปี: fcNextYear },
            พยากรณ์MLNixtla: hasMl ? { โมเดล: ml!.meta!.model, ความแม่นWAPE: ml!.meta!.wape, ชิ้น30วัน: Math.round((ml!.points ?? []).reduce((s, p) => s + p.yhat, 0)) } : "ยังไม่ได้รัน ML sidecar",
            รูปแบบดีมานด์: pattern ? { ประเภท: pattern.klass, ความคาดเดาได้: pattern.predictability } : null,
            ราคาและโปรโมชั่น: elast ? { ความยืดหยุ่น: elast.sensitivity, ค่าelasticity: elast.elasticity, ราคาเฉลี่ย: elast.avgPrice, ลดราคาเพิ่มยอดเปอร์เซ็นต์: elast.promoLiftPct, คำแนะนำ: elast.recommendation } : null,
            ยอดเสี่ยงเสียจากของหมด: lost ? { ของหมดในวัน: lost.coverDays, ชิ้นที่ขายไม่ได้: lost.lostUnits, บาทเสี่ยงเสีย: lost.lostRevenue, ระดับ: lost.level } : null,
            สัญญาณรีวิว: signal?.headline ? { ปัจจัย: signal.headline.label, นำกี่สัปดาห์: signal.headline.bestLagWeeks, corr: signal.headline.corr, สรุป: signal.note } : { สรุป: signal?.note ?? "รีวิวยังน้อย" },
            ปัจจัยอากาศ: reg ? { เกี่ยวกับอากาศไหม: reg.weatherRelevant, ปัจจัยที่มีนัยสำคัญ: reg.significantDrivers.map((d) => `${d.label}(${d.direction})`), สรุป: reg.summary } : null,
            สรุปเดือนล่าสุด: why,
          }}
        />
      </div>
    </div>
  );
}

function RailCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card-eq">
      <h3 className="rail-head">{icon}<span>{title}</span></h3>
      <div className="flex-1">{children}</div>
    </div>
  );
}
function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="group-title">{children}</h2>;
}
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (<div><div className="text-[11px] text-muted">{label}</div><div className="font-semibold text-ink">{value}</div>{hint && <div className="text-[10.5px] text-muted">{hint}</div>}</div>);
}
function Empty({ msg = "ข้อมูลยังไม่พอ" }: { msg?: string }) { return <div className="text-[12.5px] text-muted py-2">{msg}</div>; }

function Kpi({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="card card-pad">
      <div className="kpi-label">{icon}{label}</div>
      <div className="text-[24px] font-extrabold mt-1.5 leading-none" style={{ color: color || "#1c2330" }}>{value}</div>
      {sub && <div className="text-[12px] text-muted mt-1.5">{sub}</div>}
    </div>
  );
}
