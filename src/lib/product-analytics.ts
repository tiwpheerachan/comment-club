// ============================================================
//  วิเคราะห์สินค้า: ดีมานด์ + สต๊อก + ปัจจัยแวดล้อม
//  - คำนวณความพร้อมสต๊อก (days of cover, จุดสั่งซื้อ, ของจะหมดเมื่อไหร่)
//  - พยากรณ์ดีมานด์รายเดือนล่วงหน้า 12 เดือน (เทรนด์ × ฤดูกาลรายเดือน)
//  - หาว่า "ทำไมเดือนนี้ขายดี" จาก PM2.5 / อากาศ (correlation)
// ============================================================

export interface ProductCatalogRow {
  product_id: string;
  platform: string | null;
  name: string | null;
  brand: string | null;
  stock: number | null;
  reserved: number | null;
  stock_at: string | null;
  avg_daily_30: number | null;
  avg_daily_90: number | null;
  units_90: number | null;
}

export type StockStatus = "urgent" | "soon" | "ok" | "overstock" | "dead" | "nostock";
export interface StockMetrics {
  dailyRate: number;        // อัตราขายต่อวัน (ใช้ 30 วันล่าสุด เป็นหลัก)
  daysOfCover: number | null;
  stockoutInDays: number | null;
  status: StockStatus;
  statusLabel: string;
  reorderPoint: number;     // ถึงจุดนี้ควรสั่งเพิ่ม
  recommendedQty: number;   // แนะนำสั่งเพิ่มกี่ชิ้น
}

const STATUS_LABEL: Record<StockStatus, string> = {
  urgent: "เสี่ยงของหมด", soon: "ควรเตรียมสั่ง", ok: "ปกติ",
  overstock: "สต๊อกเกิน", dead: "ค้างสต๊อก/ไม่เคลื่อนไหว", nostock: "ไม่มีข้อมูลสต๊อก",
};

/** คำนวณความพร้อมสต๊อก/จุดสั่งซื้อ */
export function stockMetrics(p: ProductCatalogRow, leadTimeDays = 14, targetCoverDays = 30): StockMetrics {
  const dailyRate = p.avg_daily_30 && p.avg_daily_30 > 0 ? p.avg_daily_30 : (p.avg_daily_90 ?? 0);
  const stock = p.stock;
  const safety = dailyRate * leadTimeDays * 0.5; // safety stock อย่างง่าย ~50% ของดีมานด์ช่วง lead time
  const reorderPoint = Math.ceil(dailyRate * leadTimeDays + safety);
  const recommendedQty = Math.max(0, Math.ceil(dailyRate * (leadTimeDays + targetCoverDays) - (stock ?? 0)));

  let daysOfCover: number | null = null;
  let status: StockStatus;
  if (stock == null) {
    status = "nostock";
  } else if (dailyRate <= 0) {
    status = stock > 0 ? "dead" : "nostock";
  } else {
    daysOfCover = Math.round(stock / dailyRate);
    if (daysOfCover <= leadTimeDays) status = "urgent";
    else if (daysOfCover <= leadTimeDays * 2) status = "soon";
    else if (daysOfCover >= 120) status = "overstock";
    else status = "ok";
  }
  return {
    dailyRate: +dailyRate.toFixed(2), daysOfCover,
    stockoutInDays: daysOfCover, status, statusLabel: STATUS_LABEL[status],
    reorderPoint, recommendedQty,
  };
}

// ---------- พยากรณ์รายเดือน ----------
export interface MonthPoint { month: string; units: number; isForecast: boolean }

const addMonth = (ym: string, n: number) => {
  let y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
};
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** รวมดีมานด์รายวัน → รายเดือน + พยากรณ์ล่วงหน้า horizonMonths เดือน (เทรนด์ + ฤดูกาลรายเดือน) */
export function monthlyForecast(daily: { date: string; units: number }[], horizonMonths = 12): MonthPoint[] {
  if (!daily.length) return [];
  // รวมรายเดือน
  const byMonth = new Map<string, number>();
  for (const d of daily) byMonth.set(d.date.slice(0, 7), (byMonth.get(d.date.slice(0, 7)) ?? 0) + d.units);
  const months = [...byMonth.keys()].sort();
  const first = months[0], last = months[months.length - 1];
  // เติมเดือนที่ขาด = 0 (เดือนสุดท้ายอาจยังไม่ครบ → ตัดทิ้งจาก base)
  const series: { month: string; units: number }[] = [];
  for (let m = first; m <= last; m = addMonth(m, 1)) series.push({ month: m, units: byMonth.get(m) ?? 0 });
  const base = series.length > 1 ? series.slice(0, -1) : series; // ตัดเดือนปัจจุบัน (ยังไม่จบ)
  const n = base.length;
  const y = base.map((b) => b.units);

  // เทรนด์เชิงเส้นบน 12 เดือนล่าสุด
  const win = Math.min(n, 12), s0 = n - win;
  const idx: number[] = [], yy: number[] = [];
  for (let i = s0; i < n; i++) { idx.push(i); yy.push(y[i]); }
  const xb = mean(idx), yb = mean(yy);
  let num = 0, den = 0;
  for (let k = 0; k < idx.length; k++) { num += (idx[k] - xb) * (yy[k] - yb); den += (idx[k] - xb) ** 2; }
  const slope = den ? num / den : 0;
  const intercept = yb - slope * xb;
  const trendAt = (i: number) => Math.max(0, intercept + slope * i);

  // ฤดูกาลรายเดือน (เฉลี่ย units/trend ตามเดือน 1..12)
  const monRatio: number[][] = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < n; i++) {
    const t = trendAt(i);
    if (t > 0 && y[i] > 0) monRatio[+base[i].month.slice(5, 7) - 1].push(y[i] / t);
  }
  let seas = monRatio.map((r) => (r.length ? mean(r) : 1));
  const sm = mean(seas) || 1; seas = seas.map((x) => x / sm);

  const out: MonthPoint[] = base.map((s) => ({ month: s.month, units: Math.round(s.units), isForecast: false }));
  // พยากรณ์เดือนถัดไป (รวมเดือนปัจจุบันที่ตัดออกจาก base) horizonMonths เดือน
  for (let h = 1; h <= horizonMonths; h++) {
    const i = n - 1 + h;
    const ym = addMonth(base[n - 1].month, h);
    const f = Math.max(0, Math.round(trendAt(i) * seas[+ym.slice(5, 7) - 1]));
    out.push({ month: ym, units: f, isForecast: true });
  }
  return out;
}

// ---------- ปัจจัยแวดล้อม (correlation) ----------
export interface EnvMonthly { month: string; pm2_5: number | null; temp_mean: number | null; precip: number | null }

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export interface Driver { factor: "pm2_5" | "temp_mean" | "precip"; label: string; corr: number; strength: string; direction: string }

const FACTOR_LABEL = { pm2_5: "ฝุ่น PM2.5", temp_mean: "อุณหภูมิ", precip: "ปริมาณฝน" } as const;

/** หา correlation ระหว่างยอดขายรายเดือน กับปัจจัยแวดล้อม → จัดอันดับปัจจัยที่สัมพันธ์สูงสุด */
export function envDrivers(monthlyUnits: MonthPoint[], envMonthly: EnvMonthly[]): Driver[] {
  const envMap = new Map(envMonthly.map((e) => [e.month, e]));
  const actual = monthlyUnits.filter((m) => !m.isForecast);
  const pairs = actual.map((m) => ({ u: m.units, e: envMap.get(m.month) })).filter((p) => p.e);
  if (pairs.length < 4) return [];
  const units = pairs.map((p) => p.u);
  const factors: Driver["factor"][] = ["pm2_5", "temp_mean", "precip"];
  const drivers: Driver[] = [];
  for (const f of factors) {
    const vals = pairs.map((p) => p.e![f]);
    if (vals.some((v) => v == null)) continue;
    const corr = +pearson(units, vals as number[]).toFixed(2);
    const abs = Math.abs(corr);
    const strength = abs >= 0.6 ? "สูง" : abs >= 0.35 ? "ปานกลาง" : "ต่ำ";
    const direction = corr >= 0 ? "แปรผันตาม (ยิ่งสูงยิ่งขายดี)" : "แปรผกผัน (ยิ่งสูงยิ่งขายน้อย)";
    drivers.push({ factor: f, label: FACTOR_LABEL[f], corr, strength, direction });
  }
  return drivers.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
}

/** สรุปสั้น ๆ ว่าเดือนล่าสุดที่จบแล้วต่างจากค่าเฉลี่ยอย่างไร + ปัจจัยเด่น */
export function whyThisMonth(monthlyUnits: MonthPoint[], envMonthly: EnvMonthly[], drivers: Driver[]): string | null {
  const actual = monthlyUnits.filter((m) => !m.isForecast);
  if (actual.length < 4) return null;
  const lastM = actual[actual.length - 1];
  const prior = actual.slice(Math.max(0, actual.length - 13), actual.length - 1).map((m) => m.units);
  const avg = mean(prior);
  if (avg <= 0) return null;
  const diff = Math.round(((lastM.units - avg) / avg) * 100);
  const top = drivers.find((d) => Math.abs(d.corr) >= 0.35);
  const envMap = new Map(envMonthly.map((e) => [e.month, e]));
  const e = envMap.get(lastM.month);
  const ym = lastM.month;
  let s = `เดือน ${ym}: ขายได้ ${lastM.units} ชิ้น (${diff >= 0 ? "+" : ""}${diff}% เทียบค่าเฉลี่ย)`;
  if (top && e) {
    const v = e[top.factor];
    if (v != null) s += ` • ปัจจัยเด่น: ${top.label} (สัมพันธ์ ${top.direction.includes("ตาม") ? "ตาม" : "ผกผัน"} ระดับ${top.strength}, เดือนนี้ ${top.factor === "pm2_5" ? v + " μg/m³" : top.factor === "temp_mean" ? v + "°C" : v + " mm"})`;
  }
  return s;
}
