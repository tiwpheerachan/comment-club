// โปรไฟล์แอดมิน (เก็บใน localStorage) — ใช้กำกับชื่อคนตอบ/คนจัดการ
const KEY = "cc_admin";

export function getAdminName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) || "";
}
export function setAdminName(name: string): void {
  if (typeof window !== "undefined") localStorage.setItem(KEY, name.trim());
}
