// โปรไฟล์แอดมิน (เก็บใน localStorage) — ใช้กำกับชื่อคนตอบ/คนจัดการ
const KEY = "cc_admin";

export function getAdminName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) || "";
}
export function setAdminName(name: string): void {
  if (typeof window !== "undefined") localStorage.setItem(KEY, name.trim());
}

export function getDefaultBrand(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("cc_default_brand") || "";
}
export function setDefaultBrand(b: string): void {
  if (typeof window !== "undefined") localStorage.setItem("cc_default_brand", b);
}
export function getRole(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("cc_role") || "";
}
export function setRole(r: string): void {
  if (typeof window !== "undefined") localStorage.setItem("cc_role", r);
}
