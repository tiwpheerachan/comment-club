// ============================================================
//  เครื่องมือพยากรณ์ยอดขาย (Sales Forecasting)
//  เทรนด์เชิงเส้น × ฤดูกาลรายสัปดาห์ + ตรวจจับวันแคมเปญ
//  ไม่ใช้ไลบรารี ML — คำนวณทั้งหมดในตัว (deterministic, อธิบายได้)
// ============================================================

export interface DayPoint { date: string; gmv: number; units: number; net_sales?: number | null }

export interface ForecastPoint {
  date: string;
  actual: number | null;   // ยอดจริง (null = อนาคต)
  forecast: number;        // ค่าพยากรณ์
  lower: number;           // ขอบล่าง (ช่วงความเชื่อมั่น)
  upper: number;           // ขอบบน
  isCampaign: boolean;     // เป็นวันแคมเปญที่ตรวจพบหรือไม่
  isFuture: boolean;
}

export interface ForecastResult {
  points: ForecastPoint[];
  // สรุป
  trendPerDay: number;        // อัตราเติบโตต่อวัน (บาท)
  weeklySeasonality: number[];// ตัวคูณ 7 วัน (อา..ส)
  campaignDays: string[];     // วันแคมเปญที่ตรวจพบ
  // ตัวเลขสำคัญ
  last30: number;             // ยอดรวมจริง 30 วันล่าสุด
  prev30: number;             // ยอดรวมจริง 30 วันก่อนหน้า
  momPct: number;             // %เปลี่ยนแปลง MoM
  yoyPct: number | null;      // %เปลี่ยนแปลง YoY (ถ้ามีข้อมูลปีก่อน)
  forecastNext30: number;     // ยอดพยากรณ์ 30 วันข้างหน้า
  monthToDate: number;        // ยอดจริงเดือนนี้ถึงปัจจุบัน
  monthEndProjection: number; // คาดยอดปิดเดือน
  mape: number | null;        // ความแม่นย้อนหลัง (Mean Abs % Error) %
  daysOfData: number;
}

const DAY_MS = 86400000;
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** เติมวันที่ขาดให้ต่อเนื่อง (วันไม่มีข้อมูล = 0) */
function densify(points: DayPoint[]): DayPoint[] {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => toUTC(a.date) - toUTC(b.date));
  const map = new Map(sorted.map((p) => [p.date, p]));
  const out: DayPoint[] = [];
  for (let t = toUTC(sorted[0].date); t <= toUTC(sorted[sorted.length - 1].date); t += DAY_MS) {
    const d = fromUTC(t);
    out.push(map.get(d) ?? { date: d, gmv: 0, units: 0 });
  }
  return out;
}

/**
 * พยากรณ์ยอดขาย
 * @param raw   จุดข้อมูลรายวัน (รวมวันนี้ที่อาจยังไม่ครบ)
 * @param horizon จำนวนวันที่จะพยากรณ์ไปข้างหน้า
 * @param dropLast ตัดวันสุดท้ายออกจาก base (วันนี้ข้อมูลยังไม่ครบ)
 */
export function forecast(raw: DayPoint[], horizon = 30, dropLast = true): ForecastResult {
  let series = densify(raw);
  if (dropLast && series.length > 1) series = series.slice(0, -1);

  const n = series.length;
  const y = series.map((p) => p.gmv);

  // --- 1) ตรวจจับวันแคมเปญแบบ detrended: เทียบกับ "ค่ากลางเคลื่อนที่ 15 วัน" ---
  //     (กันการเข้าใจผิดจากเทรนด์โต — วันปกติช่วงหลังไม่ใช่แคมเปญ)
  const HALF = 7; // หน้าต่าง ±7 วัน = 15 วัน
  const rollMed = y.map((_, i) => {
    const w: number[] = [];
    for (let j = Math.max(0, i - HALF); j <= Math.min(n - 1, i + HALF); j++) if (y[j] > 0) w.push(y[j]);
    return median(w);
  });
  const isCamp = series.map((p, i) => rollMed[i] > 0 && p.gmv > rollMed[i] * 1.6);
  const campaignDays = series.filter((_, i) => isCamp[i]).map((p) => p.date);

  // --- 2) เทรนด์ (linear) จากวันปกติในช่วง "ล่าสุด" เพื่อจับระดับปัจจุบัน ---
  const TREND_WIN = Math.min(n, 180);
  const trStart = n - TREND_WIN;
  const trIdx: number[] = [], trY: number[] = [];
  for (let i = trStart; i < n; i++) { if (!isCamp[i] && y[i] > 0) { trIdx.push(i); trY.push(y[i]); } }
  const xbar = mean(trIdx), ybar = mean(trY);
  let rnum = 0, rden = 0;
  for (let k = 0; k < trIdx.length; k++) { rnum += (trIdx[k] - xbar) * (trY[k] - ybar); rden += (trIdx[k] - xbar) ** 2; }
  const slope = rden ? rnum / rden : 0;
  const intercept = ybar - slope * xbar;
  const trendAt = (i: number) => Math.max(0, intercept + slope * i);

  // --- 3) ฤดูกาลรายสัปดาห์: median(actual/trend) ต่อวันในรอบสัปดาห์ (ใช้ 1 ปีล่าสุด) ---
  const SEASON_WIN = Math.min(n, 365);
  const dowRatios: number[][] = [[], [], [], [], [], [], []];
  for (let i = n - SEASON_WIN; i < n; i++) {
    if (isCamp[i]) continue;
    const t = trendAt(i);
    if (t > 0 && y[i] > 0) dowRatios[new Date(toUTC(series[i].date)).getUTCDay()].push(y[i] / t);
  }
  let weekly = dowRatios.map((r) => (r.length ? median(r) : 1));
  const wmean = mean(weekly) || 1;
  weekly = weekly.map((w) => w / wmean); // normalize ให้เฉลี่ย = 1

  const baseAt = (i: number, dow: number) => trendAt(i) * weekly[dow];

  // --- 4) วัดความแม่น (MAPE) บน 30 วันปกติล่าสุด ---
  const errs: number[] = [];
  for (let i = Math.max(0, n - 30); i < n; i++) {
    if (isCamp[i] || y[i] <= 0) continue;
    const pred = baseAt(i, new Date(toUTC(series[i].date)).getUTCDay());
    errs.push(Math.abs(pred - y[i]) / y[i]);
  }
  const mape = errs.length ? Math.min(100, mean(errs) * 100) : null;

  // --- 5) ช่วงความเชื่อมั่น: ±1.5×ส่วนเบี่ยงเบนของ residual ปกติ (เฉพาะช่วงที่เทรนด์ครอบคลุม) ---
  const resid: number[] = [];
  for (let i = trStart; i < n; i++) { if (!isCamp[i] && y[i] > 0) resid.push(y[i] - baseAt(i, new Date(toUTC(series[i].date)).getUTCDay())); }
  const rstd = Math.sqrt(mean(resid.map((r) => r * r)) || 0);
  const band = 1.5 * rstd;

  // --- 6) ประกอบจุด actual + forecast ---
  const points: ForecastPoint[] = series.map((p, i) => {
    const f = baseAt(i, new Date(toUTC(p.date)).getUTCDay());
    return { date: p.date, actual: p.gmv, forecast: Math.round(f), lower: Math.round(Math.max(0, f - band)), upper: Math.round(f + band), isCampaign: isCamp[i], isFuture: false };
  });
  // future
  const lastMs = n ? toUTC(series[n - 1].date) : Date.now();
  for (let h = 1; h <= horizon; h++) {
    const i = n - 1 + h;
    const ms = lastMs + h * DAY_MS;
    const dow = new Date(ms).getUTCDay();
    const f = baseAt(i, dow);
    points.push({ date: fromUTC(ms), actual: null, forecast: Math.round(f), lower: Math.round(Math.max(0, f - band)), upper: Math.round(f + band), isCampaign: false, isFuture: true });
  }

  // --- 7) ตัวเลขสรุป ---
  const last30 = sum(y.slice(Math.max(0, n - 30)));
  const prev30 = sum(y.slice(Math.max(0, n - 60), Math.max(0, n - 30)));
  const momPct = prev30 > 0 ? ((last30 - prev30) / prev30) * 100 : 0;

  // YoY: 30 วันล่าสุด เทียบช่วงเดียวกันปีก่อน
  const yIndex = new Map(series.map((p, i) => [p.date, i]));
  let yoyCur = 0, yoyPrev = 0, yoyHave = false;
  for (let k = Math.max(0, n - 30); k < n; k++) {
    yoyCur += y[k];
    const prevDate = fromUTC(toUTC(series[k].date) - 365 * DAY_MS);
    const pi = yIndex.get(prevDate);
    if (pi != null) { yoyPrev += y[pi]; yoyHave = true; }
  }
  const yoyPct = yoyHave && yoyPrev > 0 ? ((yoyCur - yoyPrev) / yoyPrev) * 100 : null;

  const forecastNext30 = sum(points.filter((p) => p.isFuture).slice(0, 30).map((p) => p.forecast));

  // month-to-date + คาดปิดเดือน (ใช้วันสุดท้ายของ base เป็น "วันนี้")
  const refDate = series.length ? series[n - 1].date : fromUTC(Date.now());
  const ym = refDate.slice(0, 7);
  const monthToDate = sum(series.filter((p) => p.date.slice(0, 7) === ym).map((p) => p.gmv));
  const remainFc = sum(points.filter((p) => p.isFuture && p.date.slice(0, 7) === ym).map((p) => p.forecast));
  const monthEndProjection = monthToDate + remainFc;

  return {
    points,
    trendPerDay: Math.round(slope),
    weeklySeasonality: weekly.map((w) => +w.toFixed(3)),
    campaignDays,
    last30: Math.round(last30),
    prev30: Math.round(prev30),
    momPct: +momPct.toFixed(1),
    yoyPct: yoyPct == null ? null : +yoyPct.toFixed(1),
    forecastNext30: Math.round(forecastNext30),
    monthToDate: Math.round(monthToDate),
    monthEndProjection: Math.round(monthEndProjection),
    mape: mape == null ? null : +mape.toFixed(1),
    daysOfData: n,
  };
}

export const DOW_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
