// ============================================================
//  ความเสี่ยงสต๊อก: ดีมานด์จริงที่ถูกบดบัง + ยอดขายที่เสียไป
//  - reconstructDemand(): อุด "วันที่ของหมด" (ดีมานด์ถูก censor เป็น 0)
//    ทำให้พยากรณ์ไม่ต่ำเกินจริง
//  - lostSalesRisk(): คำนวณยอด/รายได้ที่จะเสียถ้าของหมดก่อนของใหม่มาถึง
// ============================================================

const DAY_MS = 86400000;
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const median = (a: number[]) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface DemandDay { date: string; units: number }

/** เติมวันที่ขาด (= 0) ให้ต่อเนื่อง */
function densify(daily: DemandDay[]): DemandDay[] {
  if (!daily.length) return [];
  const sorted = [...daily].sort((a, b) => toUTC(a.date) - toUTC(b.date));
  const map = new Map(sorted.map((d) => [d.date, d.units]));
  const out: DemandDay[] = [];
  for (let t = toUTC(sorted[0].date); t <= toUTC(sorted[sorted.length - 1].date); t += DAY_MS) {
    const d = fromUTC(t); out.push({ date: d, units: map.get(d) ?? 0 });
  }
  return out;
}

export interface ReconstructedDay { date: string; units: number; imputed: boolean }
export interface ReconstructResult {
  series: ReconstructedDay[];          // อนุกรมที่อุดวันของหมดแล้ว
  stockoutDays: string[];              // วันที่สงสัยว่าของหมด
  imputedUnits: number;                // ดีมานด์ที่เติมกลับเข้าไป (โดยประมาณ)
  observedUnits: number;               // ดีมานด์ที่เห็นจริง
  upliftPct: number;                   // % ที่ดีมานด์จริงน่าจะสูงกว่าที่เห็น
  method: "stock_history" | "heuristic";
  note: string;
}

/**
 * คืนค่าดีมานด์ที่ "แก้การถูกบดบัง" (uncensored)
 * @param daily       ดีมานด์รายวันที่สังเกตเห็น
 * @param stockByDate (ถ้ามี) สต๊อกคงเหลือรายวัน — วัน stock<=0 คือของหมดแน่นอน
 *
 * วิธีคิด:
 *  - ถ้ามีประวัติสต๊อก → วันที่ stock<=0 = ของหมด → อุดด้วยอัตราขายปกติ
 *  - ถ้าไม่มี → ใช้ heuristic: ช่วง "วัน 0 ติดกัน" ที่ยาวผิดปกติ (เกินจังหวะการขายปกติ)
 *    และอยู่ระหว่างวันที่มีการขาย ถือว่าน่าจะเป็นของหมด แล้วอุดด้วยอัตราปกติ
 */
export function reconstructDemand(daily: DemandDay[], stockByDate?: Map<string, number | null>): ReconstructResult | null {
  const dens = densify(daily);
  const n = dens.length;
  if (n < 21) return null;
  const y = dens.map((d) => d.units);
  const observedUnits = y.reduce((s, x) => s + x, 0);
  const nzVals = y.filter((v) => v > 0);
  if (nzVals.length < 3) return null;

  // อัตราขายปกติ (median ของวันที่ขาย) ใช้เป็นค่าอุด
  const normalRate = median(nzVals);

  const out: ReconstructedDay[] = dens.map((d) => ({ date: d.date, units: d.units, imputed: false }));
  const stockoutDays: string[] = [];
  let imputedUnits = 0;

  if (stockByDate && [...stockByDate.values()].some((v) => v != null)) {
    // --- มีประวัติสต๊อก: วัน stock<=0 = ของหมดจริง ---
    for (let i = 0; i < n; i++) {
      const st = stockByDate.get(dens[i].date);
      if (st != null && st <= 0 && y[i] === 0) {
        out[i] = { date: dens[i].date, units: Math.round(normalRate), imputed: true };
        imputedUnits += Math.round(normalRate);
        stockoutDays.push(dens[i].date);
      }
    }
    const upliftPct = observedUnits > 0 ? +((imputedUnits / observedUnits) * 100).toFixed(1) : 0;
    return {
      series: out, stockoutDays, imputedUnits, observedUnits, upliftPct, method: "stock_history",
      note: stockoutDays.length
        ? `พบ ${stockoutDays.length} วันที่ของหมด — ดีมานด์จริงน่าจะสูงกว่าที่เห็น ~${upliftPct}%`
        : "ไม่พบวันของหมดในช่วงที่มีประวัติสต๊อก",
    };
  }

  // --- ไม่มีประวัติสต๊อก: ใช้ heuristic จับ "ช่วง 0 ยาวผิดปกติ" ---
  // จังหวะการขายปกติ = median ของช่วงห่างระหว่างวันที่ขาย
  const saleIdx = y.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  const gaps: number[] = [];
  for (let k = 1; k < saleIdx.length; k++) gaps.push(saleIdx[k] - saleIdx[k - 1]);
  const typicalGap = Math.max(1, median(gaps));
  // ถ้าสินค้าขายแทบทุกวัน (typicalGap≈1) ช่วง 0 ที่ยาว ≥3 วันน่าสงสัย; ถ้าขายห่าง เกณฑ์สูงตาม
  const runThreshold = Math.max(3, Math.ceil(typicalGap * 2.5));

  const firstSale = saleIdx[0], lastSale = saleIdx[saleIdx.length - 1];
  let i = firstSale + 1;
  while (i <= lastSale) {
    if (y[i] === 0) {
      let j = i; while (j <= lastSale && y[j] === 0) j++;
      const runLen = j - i; // ช่วง 0 ติดกัน อยู่ภายในช่วงที่ยังขายอยู่
      if (runLen >= runThreshold) {
        for (let k = i; k < j; k++) {
          out[k] = { date: dens[k].date, units: Math.round(normalRate), imputed: true };
          imputedUnits += Math.round(normalRate);
          stockoutDays.push(dens[k].date);
        }
      }
      i = j;
    } else i++;
  }

  const upliftPct = observedUnits > 0 ? +((imputedUnits / observedUnits) * 100).toFixed(1) : 0;
  return {
    series: out, stockoutDays, imputedUnits, observedUnits, upliftPct, method: "heuristic",
    note: stockoutDays.length
      ? `สงสัยของหมด ~${stockoutDays.length} วัน (ช่วงไม่มีออเดอร์ยาวผิดจังหวะ) — ดีมานด์จริงอาจสูงกว่าที่เห็น ~${upliftPct}% ⚠ ประเมินจากรูปแบบการขาย ยังไม่มีประวัติสต๊อกยืนยัน`
      : "ไม่พบช่วงที่สงสัยว่าของหมด — ดีมานด์ที่เห็นน่าจะสะท้อนความต้องการจริง",
  };
}

// ---------- ยอดขายที่เสียไปจากของหมด (lost sales / revenue-at-risk) ----------
export interface LostSalesResult {
  coverDays: number | null;       // ของหมดในกี่วัน (ที่อัตราพยากรณ์)
  stockoutDate: string | null;    // คาดของหมดวันที่
  demandLeadTime: number;         // ดีมานด์รวมช่วง lead time ข้างหน้า
  servable: number;               // ที่จ่ายได้จากสต๊อกปัจจุบัน
  lostUnits: number;              // ชิ้นที่จะขายไม่ได้ถ้าสั่งของวันนี้ (มาถึงใน lead time)
  lostRevenue: number;            // รายได้ที่เสีย (บาท)
  unitPrice: number;              // ราคาต่อชิ้นที่ใช้คำนวณ
  horizonAtRiskUnits: number;     // ชิ้นเสี่ยงตลอด horizon ถ้าไม่สั่งเลย
  horizonAtRiskRevenue: number;   // รายได้เสี่ยงตลอด horizon ถ้าไม่สั่งเลย
  level: "none" | "low" | "high"; // ระดับความเสี่ยง
}

/**
 * ประเมินยอด/รายได้ที่จะเสียจากของหมด
 * @param futureDaily  พยากรณ์ดีมานด์รายวันข้างหน้า (จาก autoForecast points ที่ isFuture)
 * @param currentStock สต๊อกคงเหลือปัจจุบัน
 * @param leadTime     เวลาสั่งของ (วัน) — สมมติสั่งวันนี้ ของมาถึงในอีก leadTime วัน
 * @param unitPrice    ราคาขายต่อชิ้น (เช่น gmv/units ย้อนหลัง)
 */
export function lostSalesRisk(futureDaily: { units: number; date: string }[], currentStock: number | null, leadTime: number, unitPrice: number): LostSalesResult | null {
  if (currentStock == null || !futureDaily.length) return null;

  // วันของหมด (สะสมดีมานด์ > สต๊อก)
  let cum = 0, coverDays: number | null = null, stockoutDate: string | null = null;
  for (let i = 0; i < futureDaily.length; i++) {
    cum += futureDaily[i].units;
    if (cum > currentStock) { coverDays = i + 1; stockoutDate = futureDaily[i].date; break; }
  }

  // กรณีสั่งของวันนี้: ต้องประคองด้วยสต๊อกปัจจุบันไปจนของใหม่มา (leadTime วัน)
  const demandLeadTime = futureDaily.slice(0, leadTime).reduce((s, d) => s + d.units, 0);
  const servable = Math.min(currentStock, demandLeadTime);
  const lostUnits = Math.max(0, Math.round(demandLeadTime - currentStock));
  const lostRevenue = Math.round(lostUnits * unitPrice);

  // กรณีไม่สั่งเลยตลอด horizon
  const totalDemand = futureDaily.reduce((s, d) => s + d.units, 0);
  const horizonAtRiskUnits = Math.max(0, Math.round(totalDemand - currentStock));
  const horizonAtRiskRevenue = Math.round(horizonAtRiskUnits * unitPrice);

  const level: LostSalesResult["level"] = lostUnits > 0 ? "high" : (coverDays != null && coverDays <= leadTime * 1.5 ? "low" : "none");

  return {
    coverDays, stockoutDate, demandLeadTime: Math.round(demandLeadTime), servable: Math.round(servable),
    lostUnits, lostRevenue, unitPrice: +unitPrice.toFixed(2),
    horizonAtRiskUnits, horizonAtRiskRevenue, level,
  };
}

/** ราคาขายเฉลี่ยต่อชิ้นจากดีมานด์ย้อนหลัง (gmv/units ช่วงล่าสุดที่มีการขาย) */
export function avgUnitPrice(daily: { units: number; gmv: number }[], windowDays = 90): number {
  const recent = daily.slice(-windowDays);
  const u = recent.reduce((s, d) => s + d.units, 0);
  const g = recent.reduce((s, d) => s + d.gmv, 0);
  if (u > 0) return g / u;
  const u2 = daily.reduce((s, d) => s + d.units, 0);
  const g2 = daily.reduce((s, d) => s + d.gmv, 0);
  return u2 > 0 ? g2 / u2 : 0;
}
