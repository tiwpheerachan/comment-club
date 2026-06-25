// ============================================================
//  ชุดโมเดลพยากรณ์รายวัน + เลือกโมเดลอัตโนมัติ (Auto model-selection)
//  - Moving Average (baseline)
//  - Linear × Weekly seasonality (เทรนด์ + ฤดูกาลรายสัปดาห์)
//  - Holt-Winters (triple exponential smoothing, ฤดูกาล 7 วัน)
//  - Croston / TSB (สำหรับสินค้าขายเป็นช่วง intermittent/lumpy)
//  วิธีเลือก: backtest บนช่วง holdout ล่าสุด → เลือกโมเดลที่ WAPE ต่ำสุด
//  ไม่ใช้ไลบรารี ML — คำนวณในตัวทั้งหมด (deterministic, อธิบายได้)
// ============================================================

export interface Pt { date: string; value: number }

export type ModelKind = "moving_avg" | "linear_seasonal" | "holt_winters" | "croston" | "sba" | "tsb";

export interface CandidateScore { kind: ModelKind; label: string; wape: number | null; eligible: boolean }

export interface AutoForecastPoint {
  date: string;
  actual: number | null;   // ยอดจริง (null = อนาคต)
  forecast: number;        // ค่าพยากรณ์
  lower: number;
  upper: number;
  isFuture: boolean;
}

export interface AutoForecast {
  model: ModelKind;
  modelLabel: string;       // ชื่อโมเดลภาษาไทย
  why: string;              // เหตุผลที่เลือกโมเดลนี้
  points: AutoForecastPoint[];
  forecastSum: number;      // ผลรวมพยากรณ์ตลอด horizon
  backtest: { wape: number | null; mape: number | null; bias: number; n: number } | null;
  candidates: CandidateScore[];
  daysOfData: number;
}

const DAY_MS = 86400000;
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dowOf = (d: string) => new Date(toUTC(d)).getUTCDay();
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const mean = (a: number[]) => (a.length ? sum(a) / a.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** เติมวันที่ขาด (= 0) ให้เป็นอนุกรมรายวันต่อเนื่อง */
function densify(pts: Pt[]): Pt[] {
  if (!pts.length) return [];
  const sorted = [...pts].sort((a, b) => toUTC(a.date) - toUTC(b.date));
  const map = new Map(sorted.map((p) => [p.date, p.value]));
  const out: Pt[] = [];
  for (let t = toUTC(sorted[0].date); t <= toUTC(sorted[sorted.length - 1].date); t += DAY_MS) {
    const d = fromUTC(t); out.push({ date: d, value: map.get(d) ?? 0 });
  }
  return out;
}

// อนุกรมที่ densify แล้ว
interface Series { dates: string[]; y: number[] }

// โมเดลที่ fit แล้ว: ทำนายล่วงหน้า k วัน (dow = วันในสัปดาห์ของวันเป้าหมาย)
//   ahead(k, dow) → ค่าพยากรณ์, fitted(i, dow) → ค่าที่โมเดลอธิบายจุด i (ใช้คำนวณ residual band)
interface Fitted { ahead: (k: number, dow: number) => number; fitted: (i: number, dow: number) => number }

const clamp0 = (x: number) => (x > 0 ? x : 0);

// ---------- 1) Moving Average (เฉลี่ยเคลื่อนที่ + ฤดูกาลรายสัปดาห์อย่างง่าย) ----------
function fitMovingAvg(s: Series): Fitted {
  const { y } = s; const n = y.length;
  const win = Math.min(n, 28);
  const level = mean(y.slice(n - win)) || 0;
  // ฤดูกาลรายสัปดาห์: ratio เฉลี่ยตามวัน (กันโดนวันโปรกระชาก ใช้ median)
  const ratios: number[][] = Array.from({ length: 7 }, () => []);
  for (let i = Math.max(0, n - 84); i < n; i++) if (level > 0 && y[i] > 0) ratios[dowOf(s.dates[i])].push(y[i] / level);
  let wk = ratios.map((r) => (r.length ? median(r) : 1));
  const wm = mean(wk) || 1; wk = wk.map((w) => w / wm);
  return { ahead: (_k, dow) => clamp0(level * wk[dow]), fitted: (_i, dow) => clamp0(level * wk[dow]) };
}

// ---------- 2) Linear trend × Weekly seasonality ----------
function fitLinearSeasonal(s: Series): Fitted {
  const { y, dates } = s; const n = y.length;
  const win = Math.min(n, 180), s0 = n - win;
  // เทรนด์เชิงเส้น (ตัดวันที่เป็น 0 ทิ้งเพื่อจับระดับจริง)
  const xi: number[] = [], yi: number[] = [];
  for (let i = s0; i < n; i++) if (y[i] > 0) { xi.push(i); yi.push(y[i]); }
  const xb = mean(xi), yb = mean(yi);
  let num = 0, den = 0;
  for (let k = 0; k < xi.length; k++) { num += (xi[k] - xb) * (yi[k] - yb); den += (xi[k] - xb) ** 2; }
  const slope = den ? num / den : 0;
  const intercept = (xi.length ? yb : mean(y)) - slope * xb;
  const trendAt = (i: number) => clamp0(intercept + slope * i);
  // ฤดูกาลรายสัปดาห์
  const sw = Math.min(n, 365);
  const ratios: number[][] = Array.from({ length: 7 }, () => []);
  for (let i = n - sw; i < n; i++) { const t = trendAt(i); if (t > 0 && y[i] > 0) ratios[dowOf(dates[i])].push(y[i] / t); }
  let wk = ratios.map((r) => (r.length ? median(r) : 1));
  const wm = mean(wk) || 1; wk = wk.map((w) => w / wm);
  return {
    ahead: (k, dow) => clamp0(trendAt(n - 1 + k) * wk[dow]),
    fitted: (i, dow) => clamp0(trendAt(i) * wk[dow]),
  };
}

// ---------- 3) Holt-Winters (additive, ฤดูกาล 7 วันตามวันในสัปดาห์) ----------
function fitHoltWinters(s: Series, alpha = 0.3, beta = 0.05, gamma = 0.25): Fitted | null {
  const { y, dates } = s; const n = y.length;
  if (n < 21) return null; // ต้องมีอย่างน้อย ~3 สัปดาห์
  // เริ่มต้น: level = เฉลี่ย 14 วันแรก, trend = ความชันคร่าว ๆ
  const first = y.slice(0, 14);
  let level = mean(first);
  let trend = (mean(y.slice(7, 14)) - mean(y.slice(0, 7))) / 7;
  // ฤดูกาลเริ่มต้นต่อวันในสัปดาห์ = ส่วนต่างจาก level เฉลี่ยตาม dow
  const seasInit: number[][] = Array.from({ length: 7 }, () => []);
  for (let i = 0; i < n; i++) seasInit[dowOf(dates[i])].push(y[i] - level);
  const S = seasInit.map((r) => (r.length ? mean(r) : 0));
  // วน update + เก็บ fitted (one-step-ahead)
  const fittedArr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const d = dowOf(dates[i]);
    const pred = level + trend + S[d];
    fittedArr[i] = clamp0(pred);
    const prevLevel = level;
    level = alpha * (y[i] - S[d]) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    S[d] = gamma * (y[i] - level) + (1 - gamma) * S[d];
  }
  return {
    ahead: (k, dow) => clamp0(level + k * trend + S[dow]),
    fitted: (i, _dow) => fittedArr[i],
  };
}

// ---------- 4) Croston / TSB (สินค้าขายเป็นช่วง) ----------
// Croston: แยกประมาณ "ขนาดดีมานด์เมื่อขาย" กับ "ช่วงห่างระหว่างการขาย" → อัตราต่อวัน = size/interval
//   correction: 1 = Croston ดั้งเดิม, (1−α/2) = SBA (แก้อคติที่ Croston พยากรณ์สูงไป)
function fitCroston(s: Series, alpha = 0.1, correction = 1): Fitted | null {
  const { y } = s; const n = y.length;
  const nzIdx = y.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  if (nzIdx.length < 2) {
    const rate = mean(y) * correction;
    return { ahead: () => clamp0(rate), fitted: () => clamp0(rate) };
  }
  let z = y[nzIdx[0]];                 // ขนาดดีมานด์
  let x = nzIdx[0] + 1;                // ช่วงห่าง (เริ่มจากตำแหน่งแรก)
  for (let k = 1; k < nzIdx.length; k++) {
    const gap = nzIdx[k] - nzIdx[k - 1];
    z = alpha * y[nzIdx[k]] + (1 - alpha) * z;
    x = alpha * gap + (1 - alpha) * x;
  }
  const rate = (x > 0 ? z / x : z) * correction;  // ดีมานด์เฉลี่ยต่อวัน (แบนราบ)
  return { ahead: () => clamp0(rate), fitted: () => clamp0(rate) };
}
// SBA = Croston × (1 − α/2) — หลักฐานเชิงประจักษ์แน่นสุดสำหรับ ADI สูง (Syntetos & Boylan 2005)
const fitSBA = (s: Series, alpha = 0.1): Fitted | null => fitCroston(s, alpha, 1 - alpha / 2);

// TSB (Teunter-Syntetos-Babai): อัปเดต "ความน่าจะเป็นที่จะขาย" ทุกวัน → ดีกว่าตอนสินค้าเริ่มหยุดขาย
function fitTSB(s: Series, alpha = 0.1, beta = 0.05): Fitted | null {
  const { y } = s; const n = y.length;
  const nz = y.filter((v) => v > 0);
  if (nz.length < 2) { const rate = mean(y); return { ahead: () => clamp0(rate), fitted: () => clamp0(rate) }; }
  let p = nz.length / n;     // ความน่าจะเป็นที่มีดีมานด์
  let z = mean(nz);          // ขนาดดีมานด์เมื่อขาย
  for (let i = 0; i < n; i++) {
    if (y[i] > 0) { z = alpha * y[i] + (1 - alpha) * z; p = beta * 1 + (1 - beta) * p; }
    else { p = beta * 0 + (1 - beta) * p; }
  }
  const rate = p * z;
  return { ahead: () => clamp0(rate), fitted: () => clamp0(rate) };
}

const MODEL_LABEL: Record<ModelKind, string> = {
  moving_avg: "ค่าเฉลี่ยเคลื่อนที่",
  linear_seasonal: "เทรนด์ × ฤดูกาลรายสัปดาห์",
  holt_winters: "Holt-Winters (ปรับเรียบสามชั้น)",
  croston: "Croston (สินค้าขายเป็นช่วง)",
  sba: "SBA (Croston แก้อคติ)",
  tsb: "TSB (สินค้าขายเป็นช่วง)",
};

const MODEL_WHY: Record<ModelKind, string> = {
  moving_avg: "ดีมานด์ค่อนข้างนิ่ง — ค่าเฉลี่ยเคลื่อนที่ให้ผลแม่นและเสถียรที่สุด",
  linear_seasonal: "ขายต่อเนื่องและมีจังหวะรายสัปดาห์ชัด — โมเดลเทรนด์+ฤดูกาลจับได้ดีสุด",
  holt_winters: "มีทั้งแนวโน้มและฤดูกาล โมเดลปรับเรียบสามชั้นไล่ตามการเปลี่ยนแปลงได้ไวสุด",
  croston: "ขายเป็นช่วง ๆ (intermittent) — Croston ออกแบบมาเพื่อกรณีนี้โดยเฉพาะ",
  sba: "ขายเป็นช่วงและ Croston มักพยากรณ์สูงไป — SBA แก้อคติ ให้ค่าเฉลี่ยตรงกว่า",
  tsb: "ขายเป็นช่วงและดีมานด์อาจกำลังจางลง — TSB ประเมินอัตราได้เสถียรกว่า",
};

function fitModel(kind: ModelKind, s: Series): Fitted | null {
  switch (kind) {
    case "moving_avg": return fitMovingAvg(s);
    case "linear_seasonal": return fitLinearSeasonal(s);
    case "holt_winters": return fitHoltWinters(s);
    case "croston": return fitCroston(s);
    case "sba": return fitSBA(s);
    case "tsb": return fitTSB(s);
  }
}

/**
 * WAPE บนช่วง holdout: fit ด้วย train แล้วทำนาย test เทียบของจริง
 * @param bucket ขนาดถังรวมก่อนวัด error (1 = รายวัน, 7 = รายสัปดาห์)
 *   สินค้าขายเป็นช่วงควรวัดแบบรวมสัปดาห์ — เพราะ "จังหวะวันที่ขาย" คาดไม่ได้
 *   แต่ "ยอดรวมต่อสัปดาห์/รอบเติมของ" ต่างหากที่สำคัญต่อการสั่งสต๊อก
 */
function backtestWape(kind: ModelKind, full: Series, testLen: number, bucket = 1): number | null {
  const n = full.y.length;
  const trainLen = n - testLen;
  if (trainLen < 14) return null;
  const train: Series = { dates: full.dates.slice(0, trainLen), y: full.y.slice(0, trainLen) };
  const f = fitModel(kind, train);
  if (!f) return null;
  // รวมเป็นถังขนาด bucket แล้วค่อยวัด
  const predBuckets: number[] = [], actBuckets: number[] = [];
  for (let j = 0; j < testLen; j++) {
    const i = trainLen + j;
    const pred = f.ahead(j + 1, dowOf(full.dates[i]));
    const b = Math.floor(j / bucket);
    predBuckets[b] = (predBuckets[b] ?? 0) + pred;
    actBuckets[b] = (actBuckets[b] ?? 0) + full.y[i];
  }
  let absErr = 0, denom = 0;
  for (let b = 0; b < actBuckets.length; b++) { absErr += Math.abs(predBuckets[b] - actBuckets[b]); denom += actBuckets[b]; }
  if (denom <= 0) return null;
  return +((absErr / denom) * 100).toFixed(1);
}

/**
 * พยากรณ์รายวันแบบเลือกโมเดลอัตโนมัติ
 * @param raw      จุดข้อมูลรายวัน {date, value} (เช่น จำนวนชิ้นที่ขาย)
 * @param horizon  จำนวนวันที่จะพยากรณ์ไปข้างหน้า
 * @param dropLast ตัดวันสุดท้าย (วันนี้ข้อมูลยังไม่ครบ) ออกจาก base
 */
export function autoForecast(raw: Pt[], horizon = 30, dropLast = true): AutoForecast | null {
  let dens = densify(raw);
  if (dropLast && dens.length > 1) dens = dens.slice(0, -1);
  const n = dens.length;
  if (n < 14) return null;
  const s: Series = { dates: dens.map((p) => p.date), y: dens.map((p) => p.value) };

  // ความถี่การขาย → ตัดสินว่าโมเดล intermittent มีสิทธิ์ลงแข่งไหม
  const nz = s.y.filter((v) => v > 0).length;
  const adi = nz ? n / nz : Infinity;
  const intermittent = adi >= 1.32; // เกณฑ์ Syntetos-Boylan

  // ผู้เข้าแข่ง: โมเดลต่อเนื่องเสมอ + โมเดล intermittent เมื่อขายไม่สม่ำเสมอ
  const pool: ModelKind[] = ["moving_avg", "linear_seasonal", "holt_winters"];
  if (intermittent) pool.push("croston", "sba", "tsb");

  // backtest บน holdout = 20% ล่าสุด (อย่างน้อย 14 วัน, ไม่เกิน 42 วัน)
  const testLen = Math.max(14, Math.min(42, Math.round(n * 0.2)));
  // สินค้าขายเป็นช่วง → วัดความแม่นแบบรวมรายสัปดาห์ (จังหวะวันคาดไม่ได้ แต่ยอดรวมต่อสัปดาห์สำคัญ)
  const bucket = intermittent ? 7 : 1;
  const candidates: CandidateScore[] = pool.map((kind) => {
    const eligible = !!fitModel(kind, s);
    const wape = eligible ? backtestWape(kind, s, testLen, bucket) : null;
    return { kind, label: MODEL_LABEL[kind], wape, eligible };
  });

  // เลือกโมเดล WAPE ต่ำสุด (ถ้า backtest ไม่ได้เลย → ใช้ moving_avg/croston เป็น fallback)
  const scored = candidates.filter((c) => c.wape != null).sort((a, b) => (a.wape! - b.wape!));
  const best: ModelKind = scored[0]?.kind ?? (intermittent ? "croston" : "moving_avg");

  const f = fitModel(best, s)!;

  // residual band จาก fitted ในตัวอย่าง
  const resid: number[] = [];
  for (let i = Math.max(0, n - 90); i < n; i++) resid.push(s.y[i] - f.fitted(i, dowOf(s.dates[i])));
  const rstd = std(resid);
  const band = 1.28 * rstd; // ~80% interval

  // ประกอบจุด: historical fitted + future
  const points: AutoForecastPoint[] = dens.map((p, i) => {
    const fv = f.fitted(i, dowOf(p.date));
    return { date: p.date, actual: p.value, forecast: Math.round(fv), lower: Math.round(clamp0(fv - band)), upper: Math.round(fv + band), isFuture: false };
  });
  const lastMs = toUTC(dens[n - 1].date);
  for (let h = 1; h <= horizon; h++) {
    const ms = lastMs + h * DAY_MS; const dt = fromUTC(ms); const fv = f.ahead(h, dowOf(dt));
    points.push({ date: dt, actual: null, forecast: Math.round(fv), lower: Math.round(clamp0(fv - band)), upper: Math.round(fv + band), isFuture: true });
  }

  // backtest สรุปของโมเดลที่เลือก (wape/mape/bias)
  let backtest: AutoForecast["backtest"] = null;
  const trainLen = n - testLen;
  if (trainLen >= 14) {
    const tf = fitModel(best, { dates: s.dates.slice(0, trainLen), y: s.y.slice(0, trainLen) });
    if (tf) {
      // วัดที่ระดับเดียวกับตอนเลือกโมเดล (รายวันหรือรายสัปดาห์)
      const predB: number[] = [], actB: number[] = [];
      for (let j = 0; j < testLen; j++) {
        const i = trainLen + j; const pred = tf.ahead(j + 1, dowOf(s.dates[i]));
        const b = Math.floor(j / bucket);
        predB[b] = (predB[b] ?? 0) + pred; actB[b] = (actB[b] ?? 0) + s.y[i];
      }
      let absErr = 0, denom = 0, signErr = 0; const mapeArr: number[] = [];
      for (let b = 0; b < actB.length; b++) {
        absErr += Math.abs(predB[b] - actB[b]); denom += actB[b]; signErr += predB[b] - actB[b];
        if (actB[b] > 0) mapeArr.push(Math.abs(predB[b] - actB[b]) / actB[b]);
      }
      backtest = {
        wape: denom > 0 ? +((absErr / denom) * 100).toFixed(1) : null,
        mape: mapeArr.length ? +(mean(mapeArr) * 100).toFixed(1) : null,
        bias: denom > 0 ? +((signErr / denom) * 100).toFixed(1) : 0,
        n: testLen,
      };
    }
  }

  return {
    model: best,
    modelLabel: MODEL_LABEL[best],
    why: MODEL_WHY[best],
    points,
    forecastSum: Math.round(sum(points.filter((p) => p.isFuture).map((p) => p.forecast))),
    backtest,
    candidates: candidates.sort((a, b) => (a.wape == null ? 1 : b.wape == null ? -1 : a.wape - b.wape)),
    daysOfData: n,
  };
}
