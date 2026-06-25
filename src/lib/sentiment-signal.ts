// ============================================================
//  สัญญาณนำจากรีวิว/คอมเมนต์ (Sentiment-led demand)
//  ตั้งสมมติฐาน: ปริมาณรีวิว + อารมณ์รีวิว มัก "นำ" ยอดขายล่วงหน้า
//  วัดด้วย cross-correlation รายสัปดาห์ที่ lag 0..N → หาว่าสัญญาณไหนนำกี่สัปดาห์
//  ไม่ใช้ไลบรารี ML — คำนวณในตัวทั้งหมด
// ============================================================

const DAY_MS = 86400000;
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da && db ? +(num / Math.sqrt(da * db)).toFixed(2) : 0;
}

export interface SentimentDayIn { date: string; count: number; avgRating: number | null; pos: number; neg: number; neu: number; net: number }

export interface SignalLag {
  signal: "review_volume" | "net_sentiment" | "avg_rating";
  label: string;
  bestLagWeeks: number;   // จำนวนสัปดาห์ที่สัญญาณนำยอดขาย (0 = พร้อมกัน)
  corr: number;           // correlation ที่ lag ดีที่สุด
  strength: "สูง" | "ปานกลาง" | "ต่ำ";
  direction: "นำ-บวก" | "นำ-ลบ" | "ไม่ชัด";
}

export interface SentimentSignal {
  weeks: number;            // จำนวนสัปดาห์ที่นำมาวิเคราะห์
  totalReviews: number;
  signals: SignalLag[];
  headline: SignalLag | null;   // สัญญาณที่นำชัดสุด (corr สูงสุด, lag>=0)
  note: string;
  // อนุกรมรายสัปดาห์ไว้ทำกราฟเทียบ (z-score เพื่อให้สเกลเทียบกันได้)
  series: { week: string; unitsZ: number; reviewZ: number; netZ: number }[];
}

const SIGNAL_LABEL = { review_volume: "จำนวนรีวิว", net_sentiment: "อารมณ์รีวิว (สุทธิ)", avg_rating: "คะแนนดาวเฉลี่ย" } as const;

const weekIndex = (t0: number, date: string) => Math.floor((toUTC(date) - t0) / (7 * DAY_MS));

/** จัดกลุ่มค่ารายวันลงถังรายสัปดาห์ (คืน Map<weekIndex, ค่าในถัง[]>) */
function weeklyBuckets(t0: number, rows: { date: string; v: number }[]): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const r of rows) { if (!Number.isFinite(r.v)) continue; const w = weekIndex(t0, r.date); const b = m.get(w) ?? []; b.push(r.v); m.set(w, b); }
  return m;
}
const sumReduce = (rows: number[]) => rows.reduce((s, x) => s + x, 0);

const zscore = (a: number[]) => { const m = mean(a); const sd = Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; return a.map((x) => +((x - m) / sd).toFixed(2)); };

/**
 * วิเคราะห์ว่ารีวิว/คอมเมนต์เป็นสัญญาณนำยอดขายหรือไม่
 * @param demand    ดีมานด์รายวัน {date, units}
 * @param sentiment สรุปรีวิวรายวันต่อสินค้า (จาก getProductSentimentDaily)
 * @param maxLag    มองไปข้างหน้าได้สูงสุดกี่สัปดาห์
 */
export function sentimentLeadingIndicator(demand: { date: string; units: number }[], sentiment: SentimentDayIn[], maxLag = 4): SentimentSignal | null {
  if (!sentiment.length || !demand.length) return null;
  const totalReviews = sentiment.reduce((s, d) => s + d.count, 0);
  if (totalReviews < 12) return null; // รีวิวน้อยเกินไป

  // จุดเริ่มร่วม = วันแรกสุดของทั้งสองชุด
  const t0 = Math.min(toUTC(demand[0].date), toUTC(sentiment[0].date));

  const unitsW = weeklyBuckets(t0, demand.map((d) => ({ date: d.date, v: d.units })));
  const volW = weeklyBuckets(t0, sentiment.map((s) => ({ date: s.date, v: s.count })));
  const netW = weeklyBuckets(t0, sentiment.map((s) => ({ date: s.date, v: s.net })));
  const ratW = weeklyBuckets(t0, sentiment.filter((s) => s.avgRating != null).map((s) => ({ date: s.date, v: s.avgRating as number })));

  // ช่วงสัปดาห์ที่ครอบคลุม
  const allW = [...unitsW.keys(), ...volW.keys()];
  const wMin = Math.min(...allW), wMax = Math.max(...allW);
  const span = wMax - wMin + 1;
  if (span < 8) return null;

  const arrSum = (m: Map<number, number[]>) => { const out: number[] = []; for (let w = wMin; w <= wMax; w++) out.push(sumReduce(m.get(w) ?? [])); return out; };
  const arrMean = (m: Map<number, number[]>) => { const out: number[] = []; for (let w = wMin; w <= wMax; w++) out.push(mean(m.get(w) ?? [])); return out; };
  const units = arrSum(unitsW), vol = arrSum(volW), net = arrMean(netW);
  const ratRaw = arrMean(ratW);

  // cross-correlation: corr( signal[w], units[w+lag] ) สำหรับ lag 0..maxLag
  const bestLag = (sig: number[]): { lag: number; corr: number } => {
    let best = { lag: 0, corr: 0 };
    for (let lag = 0; lag <= maxLag; lag++) {
      const s: number[] = [], u: number[] = [];
      for (let w = 0; w + lag < units.length; w++) { s.push(sig[w]); u.push(units[w + lag]); }
      const c = pearson(s, u);
      if (Math.abs(c) > Math.abs(best.corr)) best = { lag, corr: c };
    }
    return best;
  };

  const build = (signal: SignalLag["signal"], sig: number[]): SignalLag => {
    const { lag, corr } = bestLag(sig);
    const abs = Math.abs(corr);
    return {
      signal, label: SIGNAL_LABEL[signal], bestLagWeeks: lag, corr,
      strength: abs >= 0.6 ? "สูง" : abs >= 0.35 ? "ปานกลาง" : "ต่ำ",
      direction: abs < 0.35 ? "ไม่ชัด" : corr >= 0 ? "นำ-บวก" : "นำ-ลบ",
    };
  };

  const signals = [build("review_volume", vol), build("net_sentiment", net), build("avg_rating", ratRaw)]
    .sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

  const headline = signals.find((s) => Math.abs(s.corr) >= 0.35) ?? null;

  let note: string;
  if (!headline) note = "ยังไม่พบความสัมพันธ์ชัดระหว่างรีวิวกับยอดขาย — ข้อมูลอาจน้อยหรือยอดขายขับเคลื่อนด้วยปัจจัยอื่น";
  else if (headline.bestLagWeeks === 0) note = `${headline.label} สัมพันธ์กับยอดขายแบบ${headline.corr >= 0 ? "ไปด้วยกัน" : "สวนทาง"} (พร้อมกัน, corr ${headline.corr}) — ใช้เป็นดัชนีสุขภาพสินค้าได้`;
  else note = `${headline.label} "นำ" ยอดขายราว ${headline.bestLagWeeks} สัปดาห์ (corr ${headline.corr}) — ${headline.corr >= 0 ? `รีวิว${headline.signal === "review_volume" ? "เยอะ" : "ดี"}ขึ้นวันนี้ มักตามด้วยยอดขายเพิ่มในอีก ${headline.bestLagWeeks} สัปดาห์` : `สัญญาณเตือน: ${headline.signal === "review_volume" ? "รีวิวพุ่ง" : "รีวิวแย่ลง"}มักตามด้วยยอดขายที่เปลี่ยนใน ${headline.bestLagWeeks} สัปดาห์`}`;

  // อนุกรมกราฟ (z-score)
  const uz = zscore(units), vz = zscore(vol), nz = zscore(net);
  const series = [] as SentimentSignal["series"];
  for (let i = 0; i < units.length; i++) {
    const ms = t0 + (wMin + i) * 7 * DAY_MS;
    series.push({ week: new Date(ms).toISOString().slice(0, 10), unitsZ: uz[i], reviewZ: vz[i], netZ: nz[i] });
  }

  return { weeks: span, totalReviews, signals, headline, note, series };
}
