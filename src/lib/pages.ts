// ทะเบียนแท็บ + ตรรกะสิทธิ์เข้าถึง (ใช้ได้ทั้ง client/server — ไม่ import โมดูล server)

export interface PageDef { key: string; label: string; path: string }

export const PAGES: PageDef[] = [
  { key: "overview", label: "ภาพรวม", path: "/" },
  { key: "brands", label: "รายแบรนด์", path: "/brands" },
  { key: "products", label: "รายสินค้า", path: "/products" },
  { key: "explore", label: "สำรวจคอมเมนต์", path: "/explore" },
  { key: "triage", label: "ศูนย์จัดการด่วน", path: "/triage" },
  { key: "replies", label: "การตอบกลับของทีม", path: "/replies" },
  { key: "retention", label: "Retention ลูกค้า", path: "/retention" },
  { key: "forecast", label: "พยากรณ์ยอดขาย", path: "/forecast" },
  { key: "stock", label: "พยากรณ์สินค้า & สต๊อก", path: "/stock" },
  { key: "trends", label: "เทรนด์ / รายงาน", path: "/trends" },
  { key: "settings", label: "ตั้งค่า", path: "/settings" },
];

interface AccessProfile { role?: string; allowed_pages?: string[] | null }

/** เข้าถึงแท็บนี้ได้ไหม — admin/super เข้าทุกแท็บ; allowed_pages ว่าง = ทุกแท็บ; มีค่า = เฉพาะที่ระบุ */
export function canAccess(profile: AccessProfile | null, key: string): boolean {
  if (!profile) return false;
  if (profile.role === "super_admin" || profile.role === "admin") return true;
  const ap = profile.allowed_pages;
  if (!ap || ap.length === 0) return true;
  return ap.includes(key);
}
