"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { forecast } from "@/lib/forecast";
import {
  demandPattern, envDrivers, envRegression, forecastQuality, monthlyForecast, stockScience, whyThisMonth,
  type EnvMonthly, type ProductCatalogRow, type StockStatus,
} from "@/lib/product-analytics";
import { Alert, Box, Info, Trend } from "./icons";

interface EnvDay { date: string; pm2_5: number | null; temp_mean: number | null; temp_max: number | null; precip: number | null }
const LEAD_OPTS = [7, 14, 30, 45];
const SERVICE_OPTS = [90, 95, 99];
const num = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("th-TH"));
const shortDate = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;
const STATUS_COLOR: Record<StockStatus, string> = { urgent: "#ef4444", soon: "#f59e0b", ok: "#16a34a", overstock: "#3b82f6", dead: "#a855f7", nostock: "#94a3b8" };

export default function StockDetailClient({ product, demand, envMonthly, envDaily }: { product: ProductCatalogRow; demand: { date: string; units: number; gmv: number }[]; envMonthly: EnvMonthly[]; envDaily: EnvDay[] }) {
  const [lead, setLead] = useState(14);
  const [service, setService] = useState(95);

  // วิทยาศาสตร์สต๊อก
  const sci = useMemo(() => stockScience(demand, lead, product.stock, 90), [demand, lead, product.stock]);
  const pattern = useMemo(() => demandPattern(demand), [demand]);
  const reg = useMemo(() => envRegression(demand, envDaily), [demand, envDaily]);

  const svcRow = sci.table.find((r) => r.service === service) ?? sci.table[1];
  const daysOfCover = product.stock != null && sci.meanDaily > 0 ? Math.round(product.stock / sci.meanDaily) : null;
  const status: StockStatus = product.stock == null ? "nostock"
    : sci.meanDaily <= 0 ? (product.stock > 0 ? "dead" : "nostock")
    : daysOfCover != null && daysOfCover <= lead ? "urgent"
    : daysOfCover != null && daysOfCover <= lead * 2 ? "soon"
    : daysOfCover != null && daysOfCover >= 120 ? "overstock" : "ok";
  const recommendedQty = Math.max(0, Math.ceil(sci.meanDaily * (lead + 30) + svcRow.safety - (product.stock ?? 0)));

  // พยากรณ์ดีมานด์รายวัน 30 วัน
  const daily = useMemo(() => {
    const fc = forecast(demand.map((d) => ({ date: d.date, gmv: d.units, units: d.units })), 30, true);
    const hist = fc.points.filter((p) => !p.isFuture).slice(-120);
    const fut = fc.points.filter((p) => p.isFuture);
    return [...hist, ...fut].map((p) => ({ date: p.date, actual: p.actual, forecast: Math.max(0, Math.round(p.forecast)), isFuture: p.isFuture }));
  }, [demand]);
  const firstFuture = daily.find((d) => d.isFuture)?.date;
  const fcNext30 = daily.filter((d) => d.isFuture).reduce((s, d) => s + d.forecast, 0);
  const quality = useMemo(() => forecastQuality(daily.filter((d) => !d.isFuture && d.actual != null).map((d) => ({ actual: d.actual as number, forecast: d.forecast }))), [daily]);

  // รายเดือน
  const monthly = useMemo(() => monthlyForecast(demand.map((d) => ({ date: d.date, units: d.units })), 12), [demand]);
  const drivers = useMemo(() => envDrivers(monthly, envMonthly), [monthly, envMonthly]);
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

      {(why || status === "urgent" || status === "dead") && (
        <div className="card card-pad space-y-1.5 mb-4">
          {status === "urgent" && <div className="flex items-start gap-2 text-[13.5px] text-neg"><Alert className="w-4 h-4 flex-none mt-0.5" /><span>สต๊อกใกล้หมด — เหลือพอขายอีก ~{daysOfCover} วัน (น้อยกว่าเวลาสั่งของ {lead} วัน) ควรรีบสั่งเพิ่ม {num(recommendedQty)} ชิ้น</span></div>}
          {status === "dead" && <div className="flex items-start gap-2 text-[13.5px] text-purple-700"><Info className="w-4 h-4 flex-none mt-0.5" /><span>สินค้าค้างสต๊อก — มีของ {num(product.stock)} ชิ้นแต่แทบไม่มียอดขาย ควรทำโปร/ระบายสต๊อก</span></div>}
          {why && <div className="flex items-start gap-2 text-[13.5px] text-ink"><Info className="w-4 h-4 flex-none mt-0.5 text-shopee" /><span>{why}</span></div>}
        </div>
      )}

      {/* 2 คอลัมน์: กราฟหลัก (ซ้าย) + วิเคราะห์เชิงลึก (ขวา) */}
      <div className="grid grid-cols-[1fr_360px] gap-4 max-[1200px]:grid-cols-1">
        {/* ซ้าย */}
        <div className="space-y-4 min-w-0">
          <div className="card card-pad">
            <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-3"><Trend className="w-4 h-4 text-shopee" /> ยอดขายรายวัน + พยากรณ์ 30 วัน (ชิ้น)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={daily} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#8a93a3" }} minTickGap={36} />
                <YAxis tick={{ fontSize: 11, fill: "#8a93a3" }} width={36} allowDecimals={false} />
                <Tooltip formatter={(v: unknown, n: string) => [v == null ? "-" : Math.round(Number(v)), n === "actual" ? "ขายจริง" : "พยากรณ์"]} labelFormatter={(d) => `วันที่ ${d}`} contentStyle={{ borderRadius: 12, border: "1px solid #e6e8ec", fontSize: 12.5 }} />
                {firstFuture && <ReferenceLine x={firstFuture} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "วันนี้", fontSize: 10, fill: "#64748b", position: "insideTopRight" }} />}
                <Area type="monotone" dataKey="forecast" name="forecast" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 4" fill="#6366f1" fillOpacity={0.08} isAnimationActive={false} />
                <Line type="monotone" dataKey="actual" name="actual" stroke="#16a34a" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="card card-pad">
            <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-1"><Box className="w-4 h-4 text-shopee" /> ดีมานด์รายเดือน + พยากรณ์ 12 เดือน</h3>
            <p className="text-[12px] text-muted mb-3">แท่งทึบ = ขายจริง • แท่งจาง = พยากรณ์ (เทรนด์ × ฤดูกาล)</p>
            <ResponsiveContainer width="100%" height={240}>
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

        {/* ขวา: rail วิเคราะห์เชิงลึก */}
        <div className="space-y-4">
          {/* ความแม่นโมเดล */}
          <RailCard title="ความแม่นของโมเดล" icon={<Trend className="w-4 h-4 text-shopee" />}>
            {quality ? (
              <>
                <div className="flex items-baseline gap-2"><span className="text-[28px] font-extrabold text-ink leading-none">{(100 - quality.wape).toFixed(0)}%</span><span className="text-[12px] text-muted">ความแม่น (จาก WAPE)</span></div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[12px]">
                  <Metric label="WAPE" value={quality.wape + "%"} hint="ยิ่งต่ำยิ่งดี" />
                  <Metric label="MAPE" value={quality.mape == null ? "-" : quality.mape + "%"} />
                  <Metric label="อคติ (Bias)" value={(quality.bias > 0 ? "+" : "") + quality.bias + "%"} hint={quality.bias > 5 ? "พยากรณ์สูงไป" : quality.bias < -5 ? "พยากรณ์ต่ำไป" : "สมดุล"} />
                  <Metric label="เกรด" value={quality.grade} />
                </div>
                <p className="text-[11px] text-muted mt-2">ประเมินจากค่าจริงเทียบพยากรณ์ {quality.n} วันล่าสุด</p>
              </>
            ) : <Empty />}
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

          {/* โมเดลปัจจัยแวดล้อม (regression) */}
          <RailCard title="ปัจจัยขับเคลื่อนยอดขาย (Regression)" icon={<Info className="w-4 h-4 text-shopee" />}>
            {reg ? (
              <>
                <div className="flex items-baseline gap-2"><span className="text-[22px] font-extrabold text-ink leading-none">R² {Math.round(reg.r2 * 100)}%</span><span className="text-[11px] text-muted">โมเดลอธิบายได้</span></div>
                <div className="space-y-1.5 mt-3">
                  {reg.terms.filter((t) => t.factor !== "trend").map((t) => {
                    const col = Math.abs(t.beta) >= 0.3 ? "#16a34a" : Math.abs(t.beta) >= 0.15 ? "#f59e0b" : "#94a3b8";
                    return (
                      <div key={t.factor} className="flex items-center gap-2">
                        <span className="w-20 text-[12px] text-ink">{t.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.abs(t.beta) * 100)}%`, background: col }} /></div>
                        <span className="w-12 text-right text-[11.5px] font-semibold" style={{ color: col }}>{t.beta >= 0 ? "+" : ""}{t.beta}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[12px] text-muted mt-2 leading-relaxed">{reg.summary}</p>
                <p className="text-[10.5px] text-muted mt-1">ค่าสัมประสิทธิ์มาตรฐาน (คุมปัจจัยอื่นแล้ว) จาก {reg.n} สัปดาห์</p>
              </>
            ) : <Empty msg="ข้อมูลยังไม่พอ (ต้องมี ≥8 สัปดาห์)" />}
          </RailCard>
        </div>
      </div>
    </div>
  );
}

function RailCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <h3 className="text-[13.5px] font-bold text-ink flex items-center gap-2 mb-2.5">{icon}{title}</h3>
      {children}
    </div>
  );
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
