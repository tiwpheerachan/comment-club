// helper ฝั่ง UI (ใช้ได้ทั้ง server/client — ไม่ import โมดูล server-only)

export const fmtScore = (s: number) => (s > 0 ? "+" : "") + s;

export function dirColor(s: number): string {
  return s >= 15 ? "#16a34a" : s > -15 ? "#d97706" : "#dc2626";
}
export function dirBg(s: number): string {
  return s >= 15 ? "#e8f7ee" : s > -15 ? "#fdf3e3" : "#fdecec";
}
export function sevColors(s: number): [string, string] {
  if (s >= 8) return ["#fdecec", "#b91c1c"];
  if (s >= 6) return ["#fef0e7", "#c2410c"];
  if (s >= 4) return ["#fdf3e3", "#b45309"];
  return ["#eef0f3", "#475569"];
}
