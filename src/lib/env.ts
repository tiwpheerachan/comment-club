// ============================================================
//  ปัจจัยแวดล้อมรายวัน (สภาพอากาศ + PM2.5) จาก Open-Meteo — ฟรี ไม่ต้องใช้ API key
//  ใช้กรุงเทพฯ เป็นตัวแทนระดับประเทศ (ปัจจัยหลักที่กระทบดีมานด์ เช่น หน้าฝุ่น/หน้าร้อน)
// ============================================================

export interface EnvDay {
  date: string;
  pm2_5: number | null;     // μg/m³ (เฉลี่ยรายวัน)
  temp_mean: number | null; // °C
  temp_max: number | null;  // °C
  precip: number | null;    // mm รวมรายวัน
}

const BKK = { lat: 13.7563, lon: 100.5018, tz: "Asia/Bangkok" };

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** เฉลี่ย pm2_5 รายชั่วโมง → รายวัน */
function hourlyToDailyMean(time: string[], values: (number | null)[]): Map<string, number> {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (let i = 0; i < time.length; i++) {
    const v = values[i];
    if (v == null) continue;
    const d = time[i].slice(0, 10);
    const b = buckets.get(d) ?? { sum: 0, n: 0 };
    b.sum += v; b.n++;
    buckets.set(d, b);
  }
  const out = new Map<string, number>();
  for (const [d, b] of buckets) if (b.n) out.set(d, +(b.sum / b.n).toFixed(1));
  return out;
}

/**
 * ดึงปัจจัยแวดล้อมรายวันช่วง [start, end] (รวมพยากรณ์อนาคต ~16 วัน)
 * รวมข้อมูลจาก 3 แหล่ง: archive (อดีต), forecast (ปัจจุบัน+อนาคต), air-quality (PM2.5)
 */
export async function fetchEnvDaily(start: string, end: string): Promise<EnvDay[]> {
  const q = (o: Record<string, string>) => new URLSearchParams({ latitude: String(BKK.lat), longitude: String(BKK.lon), timezone: BKK.tz, ...o }).toString();
  const today = new Date().toISOString().slice(0, 10);
  const minStr = (a: string, b: string) => (a < b ? a : b);
  // archive/air-quality ไม่รับวันที่อนาคต — cap ปลายช่วง (อนาคตเอาจาก forecast API แทน)
  const archiveEnd = minStr(end, today);
  const aqEnd = minStr(end, new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10));
  const merged = new Map<string, EnvDay>();
  const ensure = (d: string) => {
    let r = merged.get(d);
    if (!r) { r = { date: d, pm2_5: null, temp_mean: null, temp_max: null, precip: null }; merged.set(d, r); }
    return r;
  };

  // 1) สภาพอากาศย้อนหลัง (archive)
  try {
    const a = await getJson(`https://archive-api.open-meteo.com/v1/archive?${q({ start_date: start, end_date: archiveEnd, daily: "temperature_2m_mean,temperature_2m_max,precipitation_sum" })}`);
    const d = a.daily as { time?: string[]; temperature_2m_mean?: number[]; temperature_2m_max?: number[]; precipitation_sum?: number[] } | undefined;
    if (d?.time) d.time.forEach((dt, i) => {
      const r = ensure(dt);
      r.temp_mean = d.temperature_2m_mean?.[i] ?? null;
      r.temp_max = d.temperature_2m_max?.[i] ?? null;
      r.precip = d.precipitation_sum?.[i] ?? null;
    });
  } catch (e) { console.warn("[env] archive weather:", e instanceof Error ? e.message : e); }

  // 2) สภาพอากาศปัจจุบัน + พยากรณ์ 16 วัน (เติมช่วงท้ายที่ archive ยังไม่มี)
  try {
    const f = await getJson(`https://api.open-meteo.com/v1/forecast?${q({ past_days: "14", forecast_days: "16", daily: "temperature_2m_mean,temperature_2m_max,precipitation_sum" })}`);
    const d = f.daily as { time?: string[]; temperature_2m_mean?: number[]; temperature_2m_max?: number[]; precipitation_sum?: number[] } | undefined;
    if (d?.time) d.time.forEach((dt, i) => {
      const r = ensure(dt);
      if (r.temp_mean == null) r.temp_mean = d.temperature_2m_mean?.[i] ?? null;
      if (r.temp_max == null) r.temp_max = d.temperature_2m_max?.[i] ?? null;
      if (r.precip == null) r.precip = d.precipitation_sum?.[i] ?? null;
    });
  } catch (e) { console.warn("[env] forecast weather:", e instanceof Error ? e.message : e); }

  // 3) PM2.5 (รายชั่วโมง → เฉลี่ยรายวัน) รวมพยากรณ์อนาคต
  try {
    const aq = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${q({ start_date: start, end_date: aqEnd, hourly: "pm2_5" })}`);
    const h = aq.hourly as { time?: string[]; pm2_5?: (number | null)[] } | undefined;
    if (h?.time && h.pm2_5) {
      const daily = hourlyToDailyMean(h.time, h.pm2_5);
      for (const [d, v] of daily) ensure(d).pm2_5 = v;
    }
  } catch (e) { console.warn("[env] air quality:", e instanceof Error ? e.message : e); }

  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}
