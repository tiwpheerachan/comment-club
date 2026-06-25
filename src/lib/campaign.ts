// ============================================================
//  พยากรณ์ "วันแคมเปญ/วันสำคัญ" ล่วงหน้า (Campaign / Event uplift)
//  อิงผลที่ forecast() เรียนรู้จากยอดขายจริง (uplift แยกตามประเภท)
//  + ฉีดเข้าเส้นพยากรณ์แล้ว → ที่นี่แค่ดึงมาแสดง + แนะนำเตรียมของ
// ============================================================

import { eventForDate, TIER_LABEL, type EventTier } from "./events";
import type { EventTierUplift, ForecastResult } from "./forecast";

export interface CampaignEvent {
  date: string;
  name: string;
  tier: EventTier;
  tierLabel: string;
  daysAway: number;
  baseline: number;       // ยอดปกติของวันนั้น
  projected: number;      // ยอดคาด (รวม uplift ที่เรียนรู้)
  upliftPct: number;      // พุ่งกี่ % เหนือวันปกติ
  extraGmv: number;       // ยอดส่วนเพิ่มจากเหตุการณ์
}

export interface CampaignUplift {
  tiers: EventTierUplift[];       // ผล uplift ต่อประเภท (เรียนรู้จากประวัติจริง)
  detectedCount: number;          // จำนวนวันแคมเปญที่ตรวจพบ (spike)
  upcoming: CampaignEvent[];      // เหตุการณ์ข้างหน้าที่พยากรณ์ยอดได้
  nextBig: CampaignEvent | null;  // เมกะ/แคมเปญใหญ่/เทศกาลถัดไป
  prepNote: string;
  note: string;
}

const BIG_TIERS: EventTier[] = ["mega", "major", "cny", "songkran", "newyear"];

/**
 * วิเคราะห์เหตุการณ์ข้างหน้าจากผลพยากรณ์ยอดขาย
 * @param fc ผลจาก forecast() (มี points พร้อม baseline/forecast/eventName + eventUplift)
 */
export function campaignUplift(fc: ForecastResult): CampaignUplift {
  const future = fc.points.filter((p) => p.isFuture);
  const firstFuture = future[0]?.date;

  const upcoming: CampaignEvent[] = [];
  if (firstFuture) {
    const t0 = Date.parse(firstFuture);
    for (const p of future) {
      if (!p.eventName) continue;
      const ev = eventForDate(p.date);
      if (!ev) continue;
      const upliftPct = p.baseline > 0 ? Math.round(((p.forecast - p.baseline) / p.baseline) * 100) : 0;
      upcoming.push({
        date: p.date, name: p.eventName, tier: ev.tier, tierLabel: TIER_LABEL[ev.tier],
        daysAway: Math.round((Date.parse(p.date) - t0) / 86400000) + 1,
        baseline: p.baseline, projected: p.forecast, upliftPct, extraGmv: Math.round(p.forecast - p.baseline),
      });
    }
  }

  const nextBig = upcoming.find((e) => BIG_TIERS.includes(e.tier)) ?? null;
  const learned = fc.eventUplift.filter((t) => t.upliftPct >= 5);

  const note = learned.length
    ? `เรียนรู้จากยอดขายจริง: ${learned.slice(0, 3).map((t) => `${t.label} +${t.upliftPct}%`).join(", ")} (จากที่ผ่านมา)`
    : "ยังไม่พบผลของแคมเปญ/วันสำคัญชัดจากประวัติ — ระบบจะเรียนรู้เพิ่มเมื่อมีข้อมูลมากขึ้น";

  let prepNote = "";
  const next = upcoming.find((e) => e.upliftPct >= 5) ?? nextBig ?? upcoming[0];
  if (next) {
    prepNote = next.upliftPct >= 5
      ? `เหตุการณ์ถัดไปที่มีผล: ${next.name} (${next.tierLabel}) อีก ${next.daysAway} วัน — คาดยอด ~${fmtBaht(next.projected)} (สูงกว่าปกติ ~${next.upliftPct}%) ควรเตรียมสต๊อก/งบโฆษณาเพิ่ม ≥${next.upliftPct}%`
      : `เหตุการณ์ถัดไป ${next.name} (${next.tierLabel}) อีก ${next.daysAway} วัน — ประวัติยังไม่ชี้ว่าดันยอดชัด ลองจัดโปรกระตุ้น`;
  }

  return {
    tiers: fc.eventUplift,
    detectedCount: fc.campaignDays.length,
    upcoming, nextBig, prepNote, note,
  };
}

function fmtBaht(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return "฿" + (n / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "฿" + (n / 1e3).toFixed(0) + "K";
  return "฿" + Math.round(n);
}
