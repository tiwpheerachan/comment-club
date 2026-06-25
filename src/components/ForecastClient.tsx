"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import { campaignUplift } from "@/lib/campaign";
import type { GmvDayRow } from "@/lib/db";
import { DOW_LABELS, forecast, type ForecastResult } from "@/lib/forecast";
import AiBrief from "./AiBrief";
import { Alert, Forecast as FIcon, Info, Trend } from "./icons";

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");
const bahtShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return "฿" + (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "฿" + (n / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "฿" + (n / 1e3).toFixed(0) + "K";
  return "฿" + Math.round(n);
};
const pct = (n: number | null) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toFixed(1) + "%");
const shortDate = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;

const RANGE_OPTS = [
  { v: 90, label: "90 วัน" },
  { v: 180, label: "180 วัน" },
  { v: 365, label: "1 ปี" },
  { v: 0, label: "ทั้งหมด" },
];
const HORIZON_OPTS = [
  { v: 30, label: "30 วัน" },
  { v: 60, label: "60 วัน" },
  { v: 90, label: "90 วัน" },
];

export default function ForecastClient({ initial, platforms, brands }: { initial: GmvDayRow[]; platforms: string[]; brands: string[] }) {
  const [scope, setScope] = useState("ALL");
  const [rows, setRows] = useState<GmvDayRow[]>(initial);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(180);
  const [horizon, setHorizon] = useState(30);

  // โหลดข้อมูลใหม่เมื่อเปลี่ยน scope (ALL มาจาก server แล้ว)
  useEffect(() => {
    let alive = true;
    if (scope === "ALL") { setRows(initial); return; }
    setLoading(true);
    fetch(`/api/gmv?scope=${encodeURIComponent(scope)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: GmvDayRow[]) => { if (alive) setRows(d); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [scope, initial]);

  const fc: ForecastResult = useMemo(() => forecast(rows, horizon, true), [rows, horizon]);
  // พยากรณ์ยาว 120 วันสำหรับวิเคราะห์วันแคมเปญล่วงหน้า (ฉีด uplift ที่เรียนรู้แล้ว)
  const campaign = useMemo(() => campaignUplift(forecast(rows, 120, true)), [rows]);

  // ข้อมูลสำหรับกราฟ (จำกัดช่วงเวลาแสดงผล + รวมอนาคต)
  const chartData = useMemo(() => {
    const hist = fc.points.filter((p) => !p.isFuture);
    const fut = fc.points.filter((p) => p.isFuture);
    const sliced = range > 0 ? hist.slice(-range) : hist;
    return [...sliced, ...fut].map((p) => ({
      date: p.date,
      actual: p.actual,
      // ซ่อนเส้นพอดีรุ่นเก่าที่อยู่นอกหน้าต่างเทรนด์ (forecast = 0)
      forecast: !p.isFuture && p.forecast <= 0 ? null : p.forecast,
      band: !p.isFuture && p.forecast <= 0 ? null : ([p.lower, p.upper] as [number, number]),
      camp: p.isCampaign ? p.actual : null,
    }));
  }, [fc, range]);

  const accuracy = fc.mape == null ? null : Math.max(0, 100 - fc.mape);
  const firstFutureDate = fc.points.find((p) => p.isFuture)?.date;

  const scopeLabel = scope === "ALL" ? "ทุกแพลตฟอร์ม/แบรนด์" : scope.startsWith("platform:") ? scope.slice(9) : scope.slice(6);

  // ฤดูกาลรายสัปดาห์
  const weeklyData = fc.weeklySeasonality.map((w, i) => ({ dow: DOW_LABELS[i], mult: +(w * 100).toFixed(0), raw: w }));
  const bestDow = weeklyData.reduce((a, b) => (b.raw > a.raw ? b : a), weeklyData[0]);
  const worstDow = weeklyData.reduce((a, b) => (b.raw < a.raw ? b : a), weeklyData[0]);

  return (
    <div className="px-7 pt-5 pb-16 space-y-5 max-w-[1400px]">
      {/* ตัวกรอง scope */}
      <div className="flex flex-wrap items-center gap-2">
        <ScopeBtn active={scope === "ALL"} onClick={() => setScope("ALL")} label="รวมทั้งหมด" />
        {platforms.map((p) => (
          <ScopeBtn key={p} active={scope === "platform:" + p} onClick={() => setScope("platform:" + p)} label={p} />
        ))}
        {brands.length > 0 && (
          <select
            value={scope.startsWith("brand:") ? scope : ""}
            onChange={(e) => e.target.value && setScope(e.target.value)}
            className="border border-line rounded-full px-3.5 py-1.5 text-[13px] bg-white"
          >
            <option value="">เลือกแบรนด์…</option>
            {brands.map((b) => <option key={b} value={"brand:" + b}>{b}</option>)}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Seg opts={HORIZON_OPTS} value={horizon} onChange={setHorizon} label="พยากรณ์" />
          <Seg opts={RANGE_OPTS} value={range} onChange={setRange} label="ย้อนหลัง" />
        </div>
      </div>

      {loading && <div className="text-sm text-muted">กำลังโหลดข้อมูล {scopeLabel}…</div>}
      {!loading && fc.daysOfData < 14 && (
        <div className="card card-pad text-sm text-muted flex items-center gap-2"><Info className="w-4 h-4" /> ข้อมูลน้อยเกินไปสำหรับพยากรณ์ที่แม่นยำ (มี {fc.daysOfData} วัน)</div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[560px]:grid-cols-1">
        <Kpi label="คาดยอดปิดเดือนนี้" value={bahtShort(fc.monthEndProjection)} sub={`ทำได้แล้ว ${bahtShort(fc.monthToDate)}`} tone="accent" icon={<FIcon className="w-4 h-4" />} />
        <Kpi label={`พยากรณ์ ${horizon} วันข้างหน้า`} value={bahtShort(fc.forecastNext30)} sub={firstFutureDate ? `เริ่ม ${shortDate(firstFutureDate)}` : ""} icon={<Trend className="w-4 h-4" />} />
        <Kpi label="เทียบเดือนก่อน (MoM)" value={pct(fc.momPct)} sub={`30 วันล่าสุด ${bahtShort(fc.last30)}`} tone={fc.momPct >= 0 ? "pos" : "neg"} />
        <Kpi label="เทียบปีก่อน (YoY)" value={pct(fc.yoyPct)} sub={fc.yoyPct == null ? "ยังไม่มีข้อมูลปีก่อน" : "ช่วง 30 วันเดียวกัน"} tone={fc.yoyPct == null ? "muted" : fc.yoyPct >= 0 ? "pos" : "neg"} />
      </div>
      <div className="grid grid-cols-4 gap-3.5 max-[1100px]:grid-cols-2 max-[560px]:grid-cols-1">
        <Kpi label="แนวโน้มต่อวัน" value={(fc.trendPerDay >= 0 ? "+" : "") + bahtShort(fc.trendPerDay)} sub={fc.trendPerDay >= 0 ? "ยอดขายกำลังโต" : "ยอดขายกำลังชะลอ"} tone={fc.trendPerDay >= 0 ? "pos" : "neg"} />
        <Kpi label="ความแม่นย้อนหลัง" value={accuracy == null ? "—" : accuracy.toFixed(0) + "%"} sub={accuracy == null ? "" : `คลาดเคลื่อนเฉลี่ย ${fc.mape}%`} tone={accuracy != null && accuracy >= 80 ? "pos" : "muted"} />
        <Kpi label="วันขายดีที่สุด" value={bestDow.dow} sub={`สูงกว่าค่าเฉลี่ย ${(bestDow.raw * 100 - 100).toFixed(0)}%`} tone="pos" />
        <Kpi label="วันแคมเปญที่ตรวจพบ" value={String(fc.campaignDays.length)} sub={`ใน ${fc.daysOfData} วัน`} tone="accent" icon={<Alert className="w-4 h-4" />} />
      </div>

      {/* กราฟหลัก */}
      <div className="card card-pad">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[15px] font-bold text-ink flex items-center gap-2"><FIcon className="w-4 h-4 text-shopee" /> ยอดขายจริง + พยากรณ์ • {scopeLabel}</h3>
          <Legend />
        </div>
        <p className="text-[12px] text-muted mb-3">เส้นทึบ = ยอดจริง • เส้นประ = พยากรณ์ • แถบจาง = ช่วงความเชื่อมั่น • จุดส้ม = วันแคมเปญ</p>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#8a93a3" }} minTickGap={36} />
            <YAxis tickFormatter={bahtShort} tick={{ fontSize: 11, fill: "#8a93a3" }} width={54} />
            <Tooltip
              formatter={(v: unknown, name: string) => {
                if (name === "ช่วงเชื่อมั่น" && Array.isArray(v)) return [`${baht(v[0])} – ${baht(v[1])}`, name];
                return [v == null ? "—" : baht(Number(v)), name];
              }}
              labelFormatter={(d) => `วันที่ ${d}`}
              contentStyle={{ borderRadius: 12, border: "1px solid #e6e8ec", fontSize: 12.5 }}
            />
            {firstFutureDate && <ReferenceLine x={firstFutureDate} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: "วันนี้", fontSize: 10, fill: "#64748b", position: "insideTopRight" }} />}
            <Area type="monotone" dataKey="band" name="ช่วงเชื่อมั่น" stroke="none" fill="#6366f1" fillOpacity={0.12} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="forecast" name="พยากรณ์" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="actual" name="ยอดจริง" stroke="#16a34a" strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Scatter dataKey="camp" name="วันแคมเปญ" fill="#f97316" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-5 max-[900px]:grid-cols-1">
        {/* ฤดูกาลรายสัปดาห์ */}
        <div className="card card-pad">
          <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-1"><Trend className="w-4 h-4 text-shopee" /> รูปแบบยอดขายรายสัปดาห์</h3>
          <p className="text-[12px] text-muted mb-3">100% = ค่าเฉลี่ย • ใช้วางแผนแคมเปญ/สต็อกรายวัน</p>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={weeklyData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="dow" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis tickFormatter={(v) => v + "%"} tick={{ fontSize: 11, fill: "#8a93a3" }} width={40} />
              <Tooltip formatter={(v: unknown) => [v + "%", "เทียบค่าเฉลี่ย"]} contentStyle={{ borderRadius: 12, border: "1px solid #e6e8ec", fontSize: 12.5 }} />
              <ReferenceLine y={100} stroke="#cbd5e1" />
              <Bar dataKey="mult" radius={[5, 5, 0, 0]}>
                {weeklyData.map((d, i) => <Cell key={i} fill={d.raw >= 1 ? "#16a34a" : "#f59e0b"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[12.5px] text-muted mt-2">ขายดีสุด <b className="text-pos">{bestDow.dow}</b> • เบาสุด <b className="text-amber-600">{worstDow.dow}</b></p>
        </div>

        {/* วันแคมเปญล่าสุด */}
        <div className="card card-pad">
          <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-1"><Alert className="w-4 h-4 text-orange-500" /> วันแคมเปญที่ตรวจพบ</h3>
          <p className="text-[12px] text-muted mb-3">ยอดพุ่งผิดปกติ (เช่น 6.6, 7.7) — ระบบแยกออกจากเทรนด์ปกติแล้ว</p>
          <div className="space-y-1.5 max-h-[230px] overflow-auto pr-1">
            {fc.campaignDays.length === 0 && <div className="text-sm text-muted">ไม่พบวันแคมเปญในช่วงนี้</div>}
            {[...fc.campaignDays].reverse().slice(0, 24).map((d) => {
              const pt = fc.points.find((p) => p.date === d);
              const lift = pt && pt.baseline > 0 ? Math.round(((pt.actual! - pt.baseline) / pt.baseline) * 100) : null;
              return (
                <div key={d} className="flex items-center justify-between text-[13px] border-b border-[#f1f3f5] pb-1.5">
                  <span className="text-ink font-medium">{d}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-ink">{pt ? baht(pt.actual!) : ""}</span>
                    {lift != null && <span className="text-orange-600 font-semibold w-16 text-right">+{lift}%</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* พยากรณ์วันแคมเปญล่วงหน้า */}
      <CampaignPanel cu={campaign} />

      {/* บทวิเคราะห์ AI */}
      <AiBrief
        kind="sales"
        title={scopeLabel}
        facts={{
          ขอบเขต: scopeLabel,
          ยอด30วันล่าสุด: fc.last30,
          เทียบเดือนก่อนMoM: fc.momPct + "%",
          เทียบปีก่อนYoY: fc.yoyPct == null ? null : fc.yoyPct + "%",
          แนวโน้มต่อวันบาท: fc.trendPerDay,
          คาดปิดเดือนนี้: fc.monthEndProjection,
          พยากรณ์ถัดไปบาท: fc.forecastNext30,
          ความแม่นMAPE: fc.mape,
          วันขายดีสุด: bestDow.dow,
          จำนวนวันแคมเปญที่พบ: fc.campaignDays.length,
          ผลแคมเปญที่เรียนรู้: campaign.tiers.filter((t) => Math.abs(t.upliftPct) >= 5).map((t) => `${t.label} ${t.upliftPct >= 0 ? "+" : ""}${t.upliftPct}% (${t.n}ครั้ง)`),
          เหตุการณ์ถัดไป: campaign.upcoming[0] ? { ชื่อ: campaign.upcoming[0].name, ประเภท: campaign.upcoming[0].tierLabel, อีกกี่วัน: campaign.upcoming[0].daysAway, คาดยอด: campaign.upcoming[0].projected, สูงกว่าปกติเปอร์เซ็นต์: campaign.upcoming[0].upliftPct } : null,
        }}
      />

      {/* ข้อสังเกตอัตโนมัติ */}
      <Insights fc={fc} accuracy={accuracy} scopeLabel={scopeLabel} bestDow={bestDow.dow} horizon={horizon} />
    </div>
  );
}

function CampaignPanel({ cu }: { cu: ReturnType<typeof campaignUplift> }) {
  const TIER_COLOR: Record<string, string> = { mega: "#dc2626", major: "#ea580c", cny: "#dc2626", songkran: "#0ea5e9", newyear: "#8b5cf6", double: "#f59e0b", payday: "#16a34a", midmonth: "#6366f1" };
  const list = cu.upcoming.slice(0, 10);
  const learnedTiers = cu.tiers.filter((t) => Math.abs(t.upliftPct) >= 5);
  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h3 className="text-[15px] font-bold text-ink flex items-center gap-2"><Alert className="w-4 h-4 text-orange-500" /> พยากรณ์วันแคมเปญ/วันสำคัญล่วงหน้า</h3>
        <span className="text-[12px] text-muted">เรียนรู้จากยอดขายจริง • ตรวจพบ {cu.detectedCount} วันแคมเปญในประวัติ</span>
      </div>
      <p className="text-[12px] text-muted mb-3">{cu.note}</p>

      {/* ผล uplift ที่เรียนรู้ต่อประเภท */}
      {learnedTiers.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {learnedTiers.map((t) => (
            <span key={t.tier} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-line px-2.5 py-1 text-[12px]">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: TIER_COLOR[t.tier] || "#94a3b8" }} />
              <b className="text-ink">{t.label}</b>
              <span className={t.upliftPct >= 0 ? "text-orange-600 font-semibold" : "text-muted"}>{t.upliftPct >= 0 ? "+" : ""}{t.upliftPct}%</span>
              <span className="text-muted text-[10.5px]">({t.n}ครั้ง)</span>
            </span>
          ))}
        </div>
      )}

      {cu.prepNote && (
        <div className="flex items-start gap-2 text-[13.5px] text-orange-700 bg-orange-50 rounded-xl px-3.5 py-2.5 mb-3">
          <FIcon className="w-4 h-4 flex-none mt-0.5" /><span>{cu.prepNote}</span>
        </div>
      )}

      {list.length === 0 ? (
        <div className="text-sm text-muted">ไม่พบวันแคมเปญ/วันสำคัญในช่วง 120 วันข้างหน้า</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-[760px]:grid-cols-1">
          {list.map((e) => (
            <div key={e.date} className="flex items-center justify-between text-[13px] border-b border-[#f1f3f5] pb-1.5">
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: TIER_COLOR[e.tier] || "#94a3b8" }} />
                <span className="text-ink font-semibold">{e.name}</span>
                <span className="text-[11px] text-muted">{e.tierLabel} • อีก {e.daysAway} วัน</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-ink font-medium">{baht(e.projected)}</span>
                {e.upliftPct > 0 ? <span className="text-orange-600 font-semibold w-20 text-right">+{bahtShort(e.extraGmv)}</span> : <span className="text-muted text-[11px] w-20 text-right">ปกติ</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted mt-3">ยอดคาด = ยอดปกติของวันนั้น × ผล uplift ที่ <b>เรียนรู้จากยอดขายจริง</b>ของแต่ละประเภท (ไม่เดาตายตัว) • ปฏิทินรวมวันเลขเบิ้ล, เงินเดือนออก, สงกรานต์, ตรุษจีน, ปีใหม่</p>
    </div>
  );
}

function Insights({ fc, accuracy, scopeLabel, bestDow, horizon }: { fc: ForecastResult; accuracy: number | null; scopeLabel: string; bestDow: string; horizon: number }) {
  const lines: { tone: "good" | "bad" | "info"; text: string }[] = [];
  if (fc.momPct >= 5) lines.push({ tone: "good", text: `ยอดขาย ${scopeLabel} โตขึ้น ${fc.momPct.toFixed(0)}% เทียบ 30 วันก่อนหน้า — โมเมนตัมเป็นบวก` });
  else if (fc.momPct <= -5) lines.push({ tone: "bad", text: `ยอดขาย ${scopeLabel} ลดลง ${Math.abs(fc.momPct).toFixed(0)}% เทียบ 30 วันก่อนหน้า — ควรเร่งกระตุ้น` });
  else lines.push({ tone: "info", text: `ยอดขาย ${scopeLabel} ทรงตัว (${fc.momPct >= 0 ? "+" : ""}${fc.momPct.toFixed(0)}% MoM)` });
  if (fc.yoyPct != null) lines.push({ tone: fc.yoyPct >= 0 ? "good" : "bad", text: `เทียบช่วงเดียวกันปีก่อน ${fc.yoyPct >= 0 ? "เติบโต" : "หดตัว"} ${Math.abs(fc.yoyPct).toFixed(0)}%` });
  lines.push({ tone: "info", text: `คาดยอดปิดเดือนนี้ราว ${baht(fc.monthEndProjection)} (ทำได้แล้ว ${baht(fc.monthToDate)})` });
  lines.push({ tone: "info", text: `พยากรณ์ ${horizon} วันข้างหน้ารวม ~${baht(fc.forecastNext30)} • วันขายดีที่สุดของสัปดาห์คือวัน${bestDow}` });
  if (accuracy != null) lines.push({ tone: accuracy >= 80 ? "good" : "info", text: `ความแม่นของโมเดลย้อนหลัง ~${accuracy.toFixed(0)}% (คลาดเคลื่อนเฉลี่ย ${fc.mape}%)` });

  return (
    <div className="card card-pad">
      <h3 className="text-[15px] font-bold text-ink flex items-center gap-2 mb-3"><Info className="w-4 h-4 text-shopee" /> ข้อสังเกตอัตโนมัติ</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 max-[760px]:grid-cols-1">
        {lines.map((l, i) => (
          <div key={i} className="flex items-start gap-2 text-[13.5px]">
            {l.tone === "bad" ? <Alert className="w-4 h-4 text-neg flex-none mt-0.5" /> : l.tone === "good" ? <Trend className="w-4 h-4 text-pos flex-none mt-0.5" /> : <Info className="w-4 h-4 text-muted flex-none mt-0.5" />}
            <span className="text-ink/90">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScopeBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`text-[13px] px-3.5 py-1.5 rounded-full border font-medium transition ${active ? "bg-shopee text-white border-shopee" : "bg-white border-line text-ink hover:border-shopee/40"}`}>{label}</button>
  );
}

function Seg<T extends number>({ opts, value, onChange, label }: { opts: { v: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted font-semibold">{label}</span>
      <div className="inline-flex rounded-lg border border-line overflow-hidden bg-white">
        {opts.map((o) => (
          <button key={o.v} onClick={() => onChange(o.v)} className={`text-[12px] px-2.5 py-1.5 ${value === o.v ? "bg-shopee text-white" : "text-ink hover:bg-slate-50"}`}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

const TONE: Record<string, string> = { pos: "text-pos", neg: "text-neg", accent: "text-shopee", muted: "text-muted", ink: "text-ink" };
function Kpi({ label, value, sub, tone = "ink", icon }: { label: string; value: string; sub?: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="kpi-label">{icon}{label}</div>
      <div className={`text-[26px] font-extrabold mt-1.5 leading-none ${TONE[tone] || "text-ink"}`}>{value}</div>
      {sub && <div className="text-[12px] text-muted mt-1.5">{sub}</div>}
    </div>
  );
}

function Legend() {
  const item = (color: string, label: string, dash?: boolean) => (
    <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
      <span className="inline-block w-4 h-0" style={{ borderTop: `2px ${dash ? "dashed" : "solid"} ${color}` }} />{label}
    </span>
  );
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {item("#16a34a", "ยอดจริง")}
      {item("#6366f1", "พยากรณ์", true)}
      <span className="flex items-center gap-1.5 text-[11.5px] text-muted"><span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />แคมเปญ</span>
    </div>
  );
}
