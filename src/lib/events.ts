// ============================================================
//  ปฏิทิน "เหตุการณ์" รวมศูนย์ (แคมเปญ + วันหยุด/เทศกาลไทย)
//  ใช้ร่วมกันทั้งพยากรณ์ยอดขาย (forecast.ts) และตัววิเคราะห์แคมเปญ (campaign.ts)
//  ระบบจะ "เรียนรู้ uplift จริง" ของแต่ละประเภทจากยอดขายบริษัทเอง — ไม่เดาตายตัว
// ============================================================

export type EventTier = "mega" | "major" | "double" | "payday" | "midmonth" | "songkran" | "cny" | "newyear";

export interface EventInfo { tier: EventTier; name: string }

export const TIER_LABEL: Record<EventTier, string> = {
  mega: "เมกะแคมเปญ", major: "แคมเปญใหญ่", double: "วันเลขเบิ้ล", payday: "เงินเดือนออก",
  midmonth: "เซลกลางเดือน", songkran: "สงกรานต์", cny: "ตรุษจีน", newyear: "ปีใหม่",
};

// ลำดับความสำคัญ (ใช้เลือกเมื่อวันหนึ่งตรงหลายเหตุการณ์)
const TIER_RANK: Record<EventTier, number> = {
  mega: 0, cny: 1, major: 2, songkran: 3, newyear: 4, double: 5, payday: 6, midmonth: 7,
};

// ตรุษจีน (วันตรุษ) รายปี — ใส่ช่วง ±1 วันเป็นช่วงจับจ่าย
const CNY_DATES: Record<number, string> = {
  2024: "2024-02-10", 2025: "2025-01-29", 2026: "2026-02-17", 2027: "2027-02-06", 2028: "2028-01-26",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** วันทำการสุดท้ายของเดือน (จ–ศ) = วันเงินเดือนออกตามค่าปริยายของไทย */
function lastBusinessDay(year: number, mo1: number): number {
  const lastDom = new Date(Date.UTC(year, mo1, 0)).getUTCDate();
  let d = lastDom;
  while (d > 0) {
    const dow = new Date(Date.UTC(year, mo1 - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) break;
    d--;
  }
  return d;
}

/** คืนเหตุการณ์ของวันนั้น (null ถ้าไม่ใช่วันสำคัญ) — เลือกตัวที่สำคัญสุดถ้าตรงหลายอย่าง */
export function eventForDate(date: string): EventInfo | null {
  const yr = +date.slice(0, 4), mo = +date.slice(5, 7), day = +date.slice(8, 10);
  const hits: EventInfo[] = [];

  // วันเลขเบิ้ล (1.1–12.12)
  if (mo === day) {
    if (mo === 11 || mo === 12) hits.push({ tier: "mega", name: `${mo}.${mo}` });
    else if (mo >= 6) hits.push({ tier: "major", name: `${mo}.${mo}` });
    else hits.push({ tier: "double", name: `${mo}.${mo}` });
  }
  // สงกรานต์ 13–15 เม.ย.
  if (mo === 4 && day >= 13 && day <= 15) hits.push({ tier: "songkran", name: "สงกรานต์" });
  // ปีใหม่ 31 ธ.ค. – 2 ม.ค.
  if ((mo === 12 && day === 31) || (mo === 1 && day <= 2)) hits.push({ tier: "newyear", name: "ปีใหม่" });
  // ตรุษจีน ±1 วัน
  const cny = CNY_DATES[yr];
  if (cny) {
    const cd = Date.UTC(+cny.slice(0, 4), +cny.slice(5, 7) - 1, +cny.slice(8, 10));
    const cur = Date.UTC(yr, mo - 1, day);
    if (Math.abs(cur - cd) <= 86400000) hits.push({ tier: "cny", name: "ตรุษจีน" });
  }
  // เงินเดือนออก (วันทำการสุดท้ายของเดือน)
  if (day === lastBusinessDay(yr, mo)) hits.push({ tier: "payday", name: "เงินเดือนออก" });
  // เซลกลางเดือน
  if (day === 15) hits.push({ tier: "midmonth", name: "เซลกลางเดือน" });

  if (!hits.length) return null;
  return hits.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])[0];
}

/** สร้างรายการเหตุการณ์ในช่วง [startDate, +aheadDays วัน] */
export function eventsBetween(startDate: string, aheadDays: number): { date: string; ev: EventInfo }[] {
  const t0 = Date.UTC(+startDate.slice(0, 4), +startDate.slice(5, 7) - 1, +startDate.slice(8, 10));
  const out: { date: string; ev: EventInfo }[] = [];
  for (let off = 0; off <= aheadDays; off++) {
    const dt = new Date(t0 + off * 86400000);
    const date = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    const ev = eventForDate(date);
    if (ev) out.push({ date, ev });
  }
  return out;
}
