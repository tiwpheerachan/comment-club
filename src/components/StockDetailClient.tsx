"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { forecast } from "@/lib/forecast";
import { envDrivers, monthlyForecast, stockMetrics, whyThisMonth, type EnvMonthly, type ProductCatalogRow, type StockStatus } from "@/lib/product-analytics";
import { Alert, Box, Info, Trend } from "./icons";

const LEAD_OPTS = [7, 14, 30, 45];
const num = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("th-TH"));
const shortDate = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;
const STATUS_COLOR: Record<StockStatus, string> = { urgent: "#ef4444", soon: "#f59e0b", ok: "#16a34a", overstock: "#3b82f6", dead: "#a855f7", nostock: "#94a3b8" };

export default function StockDetailClient({ product, demand, envMonthly }: { product: ProductCatalogRow; demand: { date: string; units: number; gmv: number }[]; envMonthly: EnvMonthly[] }) {
  const [lead, setLead] = useState(14);
  const m = useMemo(() => stockMetrics(product, lead), [product, lead]);

  // พยากรณ์ดีมานด์รายวัน 30 วัน (ใช้ engine เดียวกับยอดขาย โดยมองเป็นหน่วยขาย)
  const daily = useMemo(() => {
    const fc = forecast(demand.map((d) => ({ date: d.date, gmv: d.units, units: d.units })), 30, true);
    const hist = fc.points.filter((p) => !p.isFuture).slice(-120);
    const fut = fc.points.filter((p) => p.isFuture);
    return [...hist, ...fut].map((p) => ({ date: p.date, actual: p.actual, forecast: Math.max(0, Math.round(p.forecast)), isFuture: p.isFuture }));
  }, [demand]);
  const firstFuture = daily.find((d) => d.isFuture)?.date;

  // พยากรณ์รายเดือน 12 เดือน
  const monthly = useMemo(() => monthlyForecast(demand.map((d) => ({ date: d.date, units: d.units })), 12), [demand]);
  const drivers = useMemo(() => envDrivers(monthly, envMonthly), [monthly, envMonthly]);
  const why = useMemo(() => whyThisMonth(monthly, envMonthly, drivers), [monthly, envMonthly, drivers]);

  // กราฟยอดขายรายเดือน + PM2.5 ทับ
  const envMap = new Map(envMonthly.map((e) => [e.month, e]));
  const monthlyChart = monthly.map((p) => ({ month: p.month, units: p.units, isForecast: p.isForecast, pm2_5: envMap.get(p.month)?.pm2_5 ?? null }));

  const fcNext30 = daily.filter((d) => d.isFuture).reduce((s, d) => s + d.forecast, 0);

  return (
    <div className="px-7 pt-5 pb-16 space-y-5 max-w-[1400px]">
      <Link href="/stock" className="text-shopee text-[13px] font-semibold">← กลับรายการสินค้า</Link>

      {/* lead time */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-muted font-semibold">เวลาสั่งของเข้าสต๊อก (วัน)</span>
        <div className="inline-flex rounded-lg border border-line overflow-hidden bg-white">
          {LEAD_OPTS.map((l) => <button key={l} onClick={() => setLead(l)} className={`text-[12px] px-3 py-1.5 ${lead === l ? "bg-shopee text-white" : "text-ink hover:bg-slate-50"}`}>{l}</button>)}
        </div>
        <Link href={`/products/${product.product_id}`} className="ml-auto text-[12.5px] text-shopee font-semibold">ดูรีวิวสินค้านี้ →</Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[560px]:grid-cols-1">
        <Kpi label="สต๊อกคงเหลือ" value={num(product.stock)} sub={product.reserved ? `จองอยู่ ${num(product.reserved)}` : product.stock == null ? "ไม่มีข้อมูล" : "ชิ้น"} icon={<Box className="w-4 h-4" />} />
        <Kpi label="วันคงเหลือ (cover)" value={m.daysOfCover == null ? "-" : `${m.daysOfCover} วัน`} sub={m.statusLabel} color={STATUS_COLOR[m.status]} />
        <Kpi label="แนะนำสั่งเพิ่ม" value={m.recommendedQty > 0 ? "+" + num(m.recommendedQty) : "พอแล้ว"} sub={`จุดสั่งซื้อ ${num(m.reorderPoint)} ชิ้น`} icon={<Alert className="w-4 h-4" />} color={m.recommendedQty > 0 ? "#ea580c" : "#16a34a"} />
        <Kpi label="คาดดีมานด์ 30 วัน" value={num(fcNext30) + " ชิ้น"} sub={`ขายเฉลี่ย ${m.dailyRate}/วัน`} icon={<Trend className="w-4 h-4" />} color="#6366f1" />
      </div>

      {/* ข้อสังเกต */}
      {(why || m.status === "urgent" || m.status === "dead") && (
        <div className="card card-pad space-y-1.5">
          {m.status === "urgent" && <div className="flex items-start gap-2 text-[13.5px] text-neg"><Alert className="w-4 h-4 flex-none mt-0.5" /><span>สต๊อกใกล้หมด — เหลือพอขายอีก ~{m.daysOfCover} วัน (น้อยกว่าเวลาสั่งของ {lead} วัน) ควรรีบสั่งเพิ่ม {num(m.recommendedQty)} ชิ้น</span></div>}
          {m.status === "dead" && <div className="flex items-start gap-2 text-[13.5px] text-purple-700"><Info className="w-4 h-4 flex-none mt-0.5" /><span>สินค้าค้างสต๊อก — มีของ {num(product.stock)} ชิ้นแต่แทบไม่มียอดขาย ควรทำโปร/ระบายสต๊อก</span></div>}
          {why && <div className="flex items-start gap-2 text-[13.5px] text-ink"><Info className="w-4 h-4 flex-none mt-0.5 text-shopee" /><span>{why}</span></div>}
        </div>
      )}

      {/* กราฟดีมานด์รายวัน + พยากรณ์ */}
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

      {/* รายเดือน + PM2.5 */}
      <div className="grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
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

        <div className="card card-pad">
          <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-1"><Info className="w-4 h-4 text-shopee" /> ปัจจัยแวดล้อมที่สัมพันธ์กับยอดขาย</h3>
          <p className="text-[12px] text-muted mb-3">ค่าสหสัมพันธ์ (correlation) ระหว่างยอดขายรายเดือนกับปัจจัยต่าง ๆ</p>
          {drivers.length === 0 ? (
            <div className="text-sm text-muted">ข้อมูลยังไม่พอคำนวณ (ต้องมีอย่างน้อย 4 เดือน)</div>
          ) : (
            <div className="space-y-2">
              {drivers.map((d) => {
                const abs = Math.abs(d.corr);
                const col = abs >= 0.6 ? "#16a34a" : abs >= 0.35 ? "#f59e0b" : "#94a3b8";
                return (
                  <div key={d.factor} className="flex items-center gap-3">
                    <span className="w-24 text-[13px] text-ink">{d.label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(abs * 100)}%`, background: col }} />
                    </div>
                    <span className="w-28 text-right text-[12px] font-semibold" style={{ color: col }}>{d.corr >= 0 ? "+" : ""}{d.corr} <span className="text-muted font-normal">({d.strength})</span></span>
                  </div>
                );
              })}
              <p className="text-[12px] text-muted mt-2">{drivers[0] && Math.abs(drivers[0].corr) >= 0.35 ? `สรุป: ${drivers[0].label} ${drivers[0].direction} — เป็นปัจจัยขับเคลื่อนยอดขายหลัก` : "ยอดขายไม่ผูกกับปัจจัยแวดล้อมชัดเจน (น่าจะมาจากแคมเปญ/ราคามากกว่า)"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon, color }: { label: string; value: string; sub?: string; icon?: React.ReactNode; color?: string }) {
  return (
    <div className="card card-pad">
      <div className="kpi-label">{icon}{label}</div>
      <div className="text-[24px] font-extrabold mt-1.5 leading-none" style={{ color: color || "#1c2330" }}>{value}</div>
      {sub && <div className="text-[12px] text-muted mt-1.5">{sub}</div>}
    </div>
  );
}
