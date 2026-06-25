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

// ---------- เครื่องมือ Data Science เชิงลึก ----------
const DAY_MS = 86400000;
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** เติมวันที่ขาด (= 0) ให้ดีมานด์ต่อเนื่อง */
export function densifyDaily(daily: { date: string; units: number }[]): { date: string; units: number }[] {
  if (!daily.length) return [];
  const sorted = [...daily].sort((a, b) => toUTC(a.date) - toUTC(b.date));
  const map = new Map(sorted.map((d) => [d.date, d.units]));
  const out: { date: string; units: number }[] = [];
  for (let t = toUTC(sorted[0].date); t <= toUTC(sorted[sorted.length - 1].date); t += DAY_MS) {
    const d = fromUTC(t); out.push({ date: d, units: map.get(d) ?? 0 });
  }
  return out;
}

// ---- จำแนกรูปแบบดีมานด์ (Syntetos–Boylan: ADI & CV²) ----
export interface DemandPattern { adi: number; cv2: number; klass: string; note: string; predictability: "ดี" | "ปานกลาง" | "ยาก" }
export function demandPattern(daily: { date: string; units: number }[]): DemandPattern | null {
  const arr = densifyDaily(daily).map((d) => d.units);
  if (arr.length < 14) return null;
  const nz = arr.filter((v) => v > 0);
  if (nz.length < 3) return { adi: arr.length, cv2: 0, klass: "ขายนาน ๆ ครั้ง", note: "ขายไม่บ่อย — พยากรณ์รายวันไม่เหมาะ ใช้ค่าเฉลี่ยระยะยาวแทน", predictability: "ยาก" };
  const adi = +(arr.length / nz.length).toFixed(2);
  const cv = std(nz) / (mean(nz) || 1);
  const cv2 = +(cv * cv).toFixed(2);
  const erratic = cv2 >= 0.49, intermittent = adi >= 1.32;
  let klass: string, note: string, predictability: DemandPattern["predictability"];
  if (!intermittent && !erratic) { klass = "สม่ำเสมอ (Smooth)"; note = "ขายต่อเนื่องสม่ำเสมอ — พยากรณ์แม่นยำสูง วางสต๊อกได้มั่นใจ"; predictability = "ดี"; }
  else if (intermittent && !erratic) { klass = "ขายเป็นช่วง (Intermittent)"; note = "ขายเป็นช่วง ๆ ขนาดสม่ำเสมอ — ควรเผื่อ safety stock"; predictability = "ปานกลาง"; }
  else if (!intermittent && erratic) { klass = "ผันผวน (Erratic)"; note = "ขายบ่อยแต่ปริมาณแกว่งแรง — ต้อง safety stock สูง"; predictability = "ปานกลาง"; }
  else { klass = "กระจุก/คาดยาก (Lumpy)"; note = "ขายไม่บ่อยและปริมาณแกว่งแรง — พยากรณ์ยาก ระวังสต๊อกค้าง/ขาด"; predictability = "ยาก"; }
  return { adi, cv2, klass, note, predictability };
}

// ---- Safety stock เชิงสถิติ (service level) ----
const Z: Record<number, number> = { 90: 1.2816, 95: 1.6449, 97: 1.8808, 99: 2.3263 };
export interface SafetyRow { service: number; safety: number; reorderPoint: number }
export interface StockScience {
  meanDaily: number; sigmaDaily: number;
  table: SafetyRow[];
  stockoutRisk: number | null;  // ความน่าจะเป็นของขาดสต๊อกในช่วง lead time (%)
  recommendedService: number;
}
const normCdf = (z: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); if (z > 0) p = 1 - p; return p; };

export function stockScience(daily: { date: string; units: number }[], leadTime: number, currentStock: number | null, windowDays = 90): StockScience {
  const arr = densifyDaily(daily).slice(-windowDays).map((d) => d.units);
  const meanDaily = mean(arr);
  const sigmaDaily = std(arr);
  const sigmaLT = sigmaDaily * Math.sqrt(leadTime);
  const table: SafetyRow[] = [90, 95, 99].map((s) => {
    const safety = Math.ceil(Z[s] * sigmaLT);
    return { service: s, safety, reorderPoint: Math.ceil(meanDaily * leadTime + safety) };
  });
  let stockoutRisk: number | null = null;
  if (currentStock != null && sigmaLT > 0) {
    const z = (currentStock - meanDaily * leadTime) / sigmaLT;
    stockoutRisk = +((1 - normCdf(z)) * 100).toFixed(1);
  }
  // แนะนำ service level ตามความผันผวน (ผันผวนมาก → ตั้งสูง)
  const cv = meanDaily > 0 ? sigmaDaily / meanDaily : 0;
  const recommendedService = cv > 1 ? 99 : cv > 0.5 ? 95 : 90;
  return { meanDaily: +meanDaily.toFixed(2), sigmaDaily: +sigmaDaily.toFixed(2), table, stockoutRisk, recommendedService };
}

// ---- ความแม่นของโมเดล (จากคู่ค่าจริง-พยากรณ์ย้อนหลัง) ----
export interface Quality { wape: number; mape: number | null; bias: number; rmse: number; n: number; grade: string }
export function forecastQuality(pairs: { actual: number; forecast: number }[]): Quality | null {
  const p = pairs.filter((x) => x.actual != null);
  if (p.length < 7) return null;
  let absErr = 0, sumA = 0, sumErr = 0, sq = 0; const mapeArr: number[] = [];
  for (const { actual, forecast } of p) {
    const e = forecast - actual;
    absErr += Math.abs(e); sumA += actual; sumErr += e; sq += e * e;
    if (actual > 0) mapeArr.push(Math.abs(e) / actual);
  }
  const wape = sumA > 0 ? +((absErr / sumA) * 100).toFixed(1) : 0;
  const mape = mapeArr.length ? +(mean(mapeArr) * 100).toFixed(1) : null;
  const bias = sumA > 0 ? +((sumErr / sumA) * 100).toFixed(1) : 0; // >0 = พยากรณ์สูงไป
  const rmse = +Math.sqrt(sq / p.length).toFixed(1);
  const grade = wape <= 20 ? "แม่นยำสูง" : wape <= 35 ? "ดี" : wape <= 50 ? "พอใช้" : "ควรระวัง";
  return { wape, mape, bias, rmse, n: p.length, grade };
}

// ---- OLS regression หลายตัวแปร + นัยสำคัญ (มี (X'X)⁻¹ สำหรับ standard error) ----
function invert(M: number[][]): number[][] | null {
  const k = M.length;
  const A = M.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < k; col++) {
    let piv = col; for (let r = col + 1; r < k; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col]; for (let c = 0; c < 2 * k; c++) A[col][c] /= d;
    for (let r = 0; r < k; r++) if (r !== col) { const f = A[r][col]; for (let c = 0; c < 2 * k; c++) A[r][c] -= f * A[col][c]; }
  }
  return A.map((row) => row.slice(k));
}

function olsFit(X: number[][], y: number[]): { coef: number[]; se: number[]; r2: number; adjR2: number } | null {
  const n = X.length, k = X[0]?.length ?? 0;
  if (n <= k + 1) return null;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { b[a] += X[i][a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += X[i][a] * X[i][c]; }
  const inv = invert(A);
  if (!inv) return null;
  const coef = inv.map((row) => row.reduce((s, v, j) => s + v * b[j], 0));
  const yb = mean(y); let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { const pred = X[i].reduce((s, x, j) => s + x * coef[j], 0); ssRes += (y[i] - pred) ** 2; ssTot += (y[i] - yb) ** 2; }
  const sigma2 = ssRes / (n - k);                         // ความแปรปรวนของ residual
  const se = inv.map((row, j) => Math.sqrt(Math.max(0, sigma2 * row[j])));
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const adjR2 = ssTot > 0 ? 1 - (1 - r2) * (n - 1) / (n - k) : 0; // ปรับตามจำนวนตัวแปร (กัน overfit)
  return { coef, se, r2: +r2.toFixed(3), adjR2: +Math.max(0, adjR2).toFixed(3) };
}

export interface EnvTerm { factor: string; label: string; beta: number; t: number; significant: boolean; impact: string; direction: string }
export interface EnvModel {
  r2: number; adjR2: number; n: number;
  categoryLabel: string;
  weatherRelevant: boolean;          // ประเภทสินค้านี้ "ควร" ขึ้นกับอากาศไหม
  terms: EnvTerm[];                  // เฉพาะปัจจัยอากาศที่พิจารณา (ตาม category)
  significantDrivers: EnvTerm[];     // ปัจจัยที่ผ่านนัยสำคัญทางสถิติจริง (|t|≥2)
  trendBeta: number; trendSignificant: boolean;
  summary: string;
}

/**
 * Regression ยอดขายรายสัปดาห์ ~ เทรนด์ + (ปัจจัยอากาศที่ category อนุญาตเท่านั้น)
 * - ใส่เฉพาะปัจจัยที่ "มีเหตุผลเชิงสาเหตุ" กับสินค้าประเภทนั้น (กัน correlation ลวง)
 * - รายงานเฉพาะปัจจัยที่ผ่านนัยสำคัญทางสถิติ (|t| ≥ 2 ≈ p<0.05)
 * @param allowedFactors ปัจจัยอากาศที่เกี่ยวข้องกับสินค้านี้ (จาก categorize)
 */
export function envRegression(
  daily: { date: string; units: number }[],
  envDaily: { date: string; pm2_5: number | null; temp_mean: number | null; precip: number | null }[],
  allowedFactors: ("pm2_5" | "temp_mean" | "precip")[] = ["pm2_5", "temp_mean", "precip"],
  categoryLabel = "ทั่วไป",
): EnvModel | null {
  const dens = densifyDaily(daily);
  if (dens.length < 56) return null;
  const weatherRelevant = allowedFactors.length > 0;
  const envMap = new Map(envDaily.map((e) => [e.date, e]));
  const weeks = new Map<number, { u: number; pm: number[]; t: number[]; p: number[]; idx: number }>();
  const t0 = toUTC(dens[0].date);
  for (const d of dens) {
    const w = Math.floor((toUTC(d.date) - t0) / (7 * DAY_MS));
    const b = weeks.get(w) ?? { u: 0, pm: [], t: [], p: [], idx: w };
    b.u += d.units;
    const e = envMap.get(d.date);
    if (e) { if (e.pm2_5 != null) b.pm.push(e.pm2_5); if (e.temp_mean != null) b.t.push(e.temp_mean); if (e.precip != null) b.p.push(e.precip); }
    weeks.set(w, b);
  }
  const rows = [...weeks.values()].filter((w) => w.pm.length && w.t.length).sort((a, b) => a.idx - b.idx);
  if (rows.length < 10) return null;

  const zfy = (a: number[]) => { const m = mean(a), s = std(a) || 1; return a.map((x) => (x - m) / s); };
  const y = zfy(rows.map((r) => r.u));
  const trend = zfy(rows.map((r) => r.idx));
  // สร้างคอลัมน์: [1, trend, ...ปัจจัยอากาศที่อนุญาต]
  const colDefs: { factor: string; label: string; vals: number[] }[] = [];
  const fmap: Record<string, () => number[]> = {
    pm2_5: () => rows.map((r) => mean(r.pm)),
    temp_mean: () => rows.map((r) => mean(r.t)),
    precip: () => rows.map((r) => mean(r.p)),
  };
  const FLABEL: Record<string, string> = { pm2_5: "ฝุ่น PM2.5", temp_mean: "อุณหภูมิ", precip: "ปริมาณฝน" };
  for (const f of allowedFactors) colDefs.push({ factor: f, label: FLABEL[f], vals: zfy(fmap[f]()) });

  const X = rows.map((_, i) => [1, trend[i], ...colDefs.map((c) => c.vals[i])]);
  const res = olsFit(X, y);
  if (!res) return null;
  const dfOK = rows.length - X[0].length; // degrees of freedom

  const trendBeta = +res.coef[1].toFixed(2);
  const trendT = res.se[1] > 0 ? res.coef[1] / res.se[1] : 0;

  const terms: EnvTerm[] = colDefs.map((c, i) => {
    const beta = res.coef[2 + i];
    const t = res.se[2 + i] > 0 ? beta / res.se[2 + i] : 0;
    const significant = Math.abs(t) >= 2 && dfOK >= 3;
    return {
      factor: c.factor, label: c.label, beta: +beta.toFixed(2), t: +t.toFixed(1), significant,
      impact: !significant ? "ไม่สำคัญ" : Math.abs(beta) >= 0.3 ? "สูง" : Math.abs(beta) >= 0.15 ? "ปานกลาง" : "ต่ำ",
      direction: beta >= 0 ? "ยิ่งสูงยิ่งขายดี" : "ยิ่งสูงยิ่งขายน้อย",
    };
  }).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta));

  const significantDrivers = terms.filter((t) => t.significant);

  let summary: string;
  if (!weatherRelevant) {
    summary = `สินค้าประเภท "${categoryLabel}" ไม่ได้ขึ้นกับสภาพอากาศ — ยอดขายขับเคลื่อนด้วย${trendBeta >= 0 ? "แนวโน้มขาขึ้น" : "แนวโน้มขาลง"}/แคมเปญ/รีวิว`;
  } else if (significantDrivers.length) {
    const top = significantDrivers[0];
    summary = `ปัจจัยที่มีผลจริงทางสถิติ: ${top.label} (${top.direction}, t=${top.t}) • โมเดลอธิบายได้ ${Math.round(res.adjR2 * 100)}% (adj R²)`;
  } else {
    summary = `ทดสอบปัจจัยอากาศที่เกี่ยวข้องแล้ว ยังไม่พบนัยสำคัญทางสถิติ — ยอดขายช่วงนี้น่าจะมาจากแคมเปญ/ราคา/รีวิวมากกว่า`;
  }

  return {
    r2: res.r2, adjR2: res.adjR2, n: rows.length, categoryLabel, weatherRelevant,
    terms, significantDrivers, trendBeta, trendSignificant: Math.abs(trendT) >= 2,
    summary,
  };
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

/** หา correlation ระหว่างยอดขายรายเดือน กับปัจจัยแวดล้อม → จัดอันดับปัจจัยที่สัมพันธ์สูงสุด
 *  @param allowedFactors พิจารณาเฉพาะปัจจัยที่เกี่ยวข้องกับประเภทสินค้านี้ (กัน correlation ลวง) */
export function envDrivers(monthlyUnits: MonthPoint[], envMonthly: EnvMonthly[], allowedFactors: Driver["factor"][] = ["pm2_5", "temp_mean", "precip"]): Driver[] {
  if (!allowedFactors.length) return [];
  const envMap = new Map(envMonthly.map((e) => [e.month, e]));
  const actual = monthlyUnits.filter((m) => !m.isForecast);
  const pairs = actual.map((m) => ({ u: m.units, e: envMap.get(m.month) })).filter((p) => p.e);
  if (pairs.length < 4) return [];
  const units = pairs.map((p) => p.u);
  const factors: Driver["factor"][] = allowedFactors;
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
