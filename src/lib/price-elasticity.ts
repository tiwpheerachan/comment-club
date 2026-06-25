// ============================================================
//  ความยืดหยุ่นของราคา (Price elasticity) + ความไวต่อโปรโมชั่น
//  ราคาเป็น "ปัจจัยขับเคลื่อนยอดขาย" ที่ทรงพลังที่สุดอย่างหนึ่ง
//  เรามี gmv และ units รายวันอยู่แล้ว → ราคาเฉลี่ยต่อชิ้น = gmv/units
//  ประเมิน elasticity ด้วย log-log regression: ln(units) ~ a + b·ln(price)
//    b = %เปลี่ยนยอดขาย ต่อ %เปลี่ยนราคา (คาดเป็นลบ)
//    |b|>1 = ยืดหยุ่นสูง (ลดราคาดันยอดแรง), |b|<1 = ไม่ยืดหยุ่น (ลดราคาเสียมาร์จิน)
// ============================================================

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const std = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface PriceElasticity {
  n: number;                 // จำนวนวันที่ใช้
  avgPrice: number;          // ราคาเฉลี่ยต่อชิ้น
  minPrice: number; maxPrice: number;
  elasticity: number;        // b (ลบ = ลดราคาแล้วขายดีขึ้น)
  t: number;                 // t-stat ของ b
  significant: boolean;      // |t| ≥ 2
  r2: number;
  sensitivity: "ยืดหยุ่นสูง" | "ยืดหยุ่นปานกลาง" | "ไม่ยืดหยุ่น" | "ไม่ชัด";
  promoLiftPct: number | null; // ยอดขายวันลดราคาสูงกว่าวันปกติกี่ %
  promoThreshold: number | null; // ราคาที่ถือว่า "ลดราคา" (≤95% ของ median)
  note: string;
  recommendation: string;
}

/**
 * ประเมินความยืดหยุ่นของราคา จากยอดขายรายวัน
 * @param daily {date, units, gmv}
 */
export function priceElasticity(daily: { date: string; units: number; gmv: number }[]): PriceElasticity | null {
  // ใช้เฉพาะวันที่มียอดขายและคำนวณราคาได้
  const pts = daily
    .filter((d) => d.units > 0 && d.gmv > 0)
    .map((d) => ({ price: d.gmv / d.units, units: d.units }));
  if (pts.length < 30) return null;

  const prices = pts.map((p) => p.price);
  const avgPrice = mean(prices);
  const priceCV = avgPrice > 0 ? std(prices) / avgPrice : 0;
  const minPrice = Math.min(...prices), maxPrice = Math.max(...prices);

  // ถ้าราคาแทบไม่ขยับ → ประเมิน elasticity ไม่ได้
  if (priceCV < 0.02) {
    return {
      n: pts.length, avgPrice: +avgPrice.toFixed(2), minPrice: +minPrice.toFixed(2), maxPrice: +maxPrice.toFixed(2),
      elasticity: 0, t: 0, significant: false, r2: 0, sensitivity: "ไม่ชัด",
      promoLiftPct: null, promoThreshold: null,
      note: "ราคาคงที่เกือบตลอด — ประเมินความยืดหยุ่นไม่ได้ (ไม่มีการแปรผันของราคา)",
      recommendation: "ลองทำ A/B ราคา/ส่วนลดเป็นช่วง เพื่อให้ระบบเรียนรู้ว่าลดราคาแล้วยอดเพิ่มแค่ไหน",
    };
  }

  // log-log OLS
  const X = pts.map((p) => Math.log(p.price));
  const Y = pts.map((p) => Math.log(p.units));
  const xb = mean(X), yb = mean(Y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < X.length; i++) { sxy += (X[i] - xb) * (Y[i] - yb); sxx += (X[i] - xb) ** 2; }
  const b = sxx ? sxy / sxx : 0;        // elasticity
  const a = yb - b * xb;
  // R² + standard error ของ b
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < X.length; i++) { const pred = a + b * X[i]; ssRes += (Y[i] - pred) ** 2; ssTot += (Y[i] - yb) ** 2; }
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  const sigma2 = ssRes / (X.length - 2);
  const seB = sxx > 0 ? Math.sqrt(sigma2 / sxx) : 0;
  const t = seB > 0 ? b / seB : 0;
  const significant = Math.abs(t) >= 2;

  const absB = Math.abs(b);
  const sensitivity: PriceElasticity["sensitivity"] = !significant ? "ไม่ชัด" : absB >= 1 ? "ยืดหยุ่นสูง" : absB >= 0.4 ? "ยืดหยุ่นปานกลาง" : "ไม่ยืดหยุ่น";

  // โปรโมชั่น: เทียบยอดวัน "ลดราคา" (≤95% median) กับวันปกติ
  const medPrice = median(prices);
  const promoThreshold = +(medPrice * 0.95).toFixed(2);
  const promoUnits = pts.filter((p) => p.price <= promoThreshold).map((p) => p.units);
  const normalUnits = pts.filter((p) => p.price > promoThreshold).map((p) => p.units);
  let promoLiftPct: number | null = null;
  if (promoUnits.length >= 3 && normalUnits.length >= 3) {
    const mn = median(normalUnits);
    if (mn > 0) promoLiftPct = +(((median(promoUnits) - mn) / mn) * 100).toFixed(0);
  }

  let note: string, recommendation: string;
  if (!significant) {
    note = `ความสัมพันธ์ราคา-ยอดขายยังไม่ชัดทางสถิติ (t=${t.toFixed(1)}) — ยอดขายอาจถูกขับด้วยปัจจัยอื่นมากกว่าราคา`;
    recommendation = "โฟกัสปัจจัยอื่น (รีวิว/แคมเปญ/การมองเห็น) มากกว่าการเล่นราคา";
  } else if (absB >= 1) {
    note = `ยืดหยุ่นสูง: ลดราคา 10% คาดยอดขายเพิ่ม ~${Math.round(absB * 10)}% (elasticity ${b.toFixed(2)})${promoLiftPct != null ? ` • วันลดราคาขายดีกว่าปกติ ~${promoLiftPct}%` : ""}`;
    recommendation = "ส่วนลด/แฟลชเซลได้ผลสูงกับสินค้านี้ — ใช้กระตุ้นช่วงแคมเปญและระบายสต๊อกเกินได้ดี";
  } else if (absB >= 0.4) {
    note = `ยืดหยุ่นปานกลาง: ลดราคา 10% คาดยอดเพิ่ม ~${Math.round(absB * 10)}% (elasticity ${b.toFixed(2)})`;
    recommendation = "ลดราคาช่วยได้บ้าง — ใช้เฉพาะช่วงแคมเปญ ไม่ควรลดถาวรเพราะเสียมาร์จินเกินยอดที่เพิ่ม";
  } else {
    note = `ไม่ยืดหยุ่น: ราคาแทบไม่กระทบยอดขาย (elasticity ${b.toFixed(2)}) — ลูกค้าซื้อเพราะความจำเป็น/แบรนด์`;
    recommendation = "ไม่ควรหั่นราคา — รักษามาร์จินไว้ แล้วไปเพิ่มยอดด้วยการมองเห็น/รีวิว/บันเดิล";
  }

  return {
    n: pts.length, avgPrice: +avgPrice.toFixed(2), minPrice: +minPrice.toFixed(2), maxPrice: +maxPrice.toFixed(2),
    elasticity: +b.toFixed(2), t: +t.toFixed(1), significant, r2: +r2.toFixed(2),
    sensitivity, promoLiftPct, promoThreshold, note, recommendation,
  };
}

// ---------- ระยะวงจรชีวิตสินค้า (Product lifecycle stage) ----------
export interface Lifecycle {
  stage: "ใหม่/เปิดตัว" | "กำลังโต" | "อิ่มตัว" | "ขาลง" | "ฟื้นตัว";
  ageDays: number;
  recentVsPeakPct: number;   // ยอดล่าสุดเทียบจุดพีค (%)
  note: string;
}

/** ประเมินระยะวงจรชีวิตจากรูปทรงยอดขาย (อายุ + เทรนด์ล่าสุด + เทียบพีค) */
export function lifecycleStage(daily: { date: string; units: number }[]): Lifecycle | null {
  if (daily.length < 28) return null;
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0].date, last = sorted[sorted.length - 1].date;
  const ageDays = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;

  // ยอดรวมรายสัปดาห์ (ลด noise)
  const weekly = new Map<number, number>();
  const t0 = Date.parse(first);
  for (const d of sorted) { const w = Math.floor((Date.parse(d.date) - t0) / (7 * 86400000)); weekly.set(w, (weekly.get(w) ?? 0) + d.units); }
  const ws = [...weekly.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  // ตัดสัปดาห์สุดท้ายทิ้งถ้ายังไม่ครบ 7 วัน (กันค่าตกหลอกว่าขาลง)
  const lastFull = (Date.parse(last) - t0) % (7 * 86400000) >= 6 * 86400000;
  if (!lastFull && ws.length > 5) ws.pop();
  if (ws.length < 4) return null;

  const peak = Math.max(...ws);
  const recent = mean(ws.slice(-4));            // เฉลี่ย 4 สัปดาห์ล่าสุด
  const early = mean(ws.slice(0, Math.min(4, ws.length)));
  const recentVsPeakPct = peak > 0 ? +((recent / peak) * 100).toFixed(0) : 0;

  // เทรนด์ล่าสุด (8 สัปดาห์)
  const tail = ws.slice(-8);
  const tb = mean(tail.map((_, i) => i)), yb = mean(tail);
  let num = 0, den = 0;
  for (let i = 0; i < tail.length; i++) { num += (i - tb) * (tail[i] - yb); den += (i - tb) ** 2; }
  const slope = den ? num / den : 0;
  const slopePct = yb > 0 ? slope / yb : 0; // ความชันเทียบระดับ

  let stage: Lifecycle["stage"], note: string;
  if (ageDays <= 45) { stage = "ใหม่/เปิดตัว"; note = "สินค้าใหม่ — ข้อมูลยังสั้น พยากรณ์ใช้ค่าเฉลี่ยกว้าง ระวังสั่งสต๊อกเกิน/ขาด"; }
  else if (slopePct > 0.04 && recent >= early) { stage = "กำลังโต"; note = "ยอดขายขาขึ้น — เตรียมสต๊อกเชิงรุก กันของขาดช่วงพีค"; }
  else if (recentVsPeakPct < 55 && slopePct < -0.02) { stage = "ขาลง"; note = `ยอดลดเหลือ ~${recentVsPeakPct}% ของจุดพีค — ลดการสั่ง ระบายสต๊อก เลี่ยงค้าง`; }
  else if (slopePct > 0.04 && recentVsPeakPct < 70) { stage = "ฟื้นตัว"; note = "ยอดกำลังกลับมา — จับตาว่ากลับมายั่งยืนไหมก่อนเพิ่มสต๊อก"; }
  else { stage = "อิ่มตัว"; note = "ยอดขายทรงตัว — พยากรณ์แม่นสุดช่วงนี้ วางสต๊อกตาม safety stock ปกติ"; }

  return { stage, ageDays, recentVsPeakPct, note };
}
