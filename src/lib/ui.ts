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

/**
 * ลิงก์ไปหน้าสินค้า Shopee (ส่วนรีวิว) เพื่อตรวจสอบคอมเมนต์/คำตอบ
 * รูปแบบ canonical: https://shopee.co.th/product/{shop_id}/{item_id}
 * คืน null ถ้าไม่มี shop_id หรือ item_id (สร้างลิงก์ไม่ได้)
 */
export function shopeeProductUrl(shopId?: string | number | null, itemId?: string | number | null): string | null {
  const s = shopId == null ? "" : String(shopId).trim();
  const i = itemId == null ? "" : String(itemId).trim();
  if (!s || !i || s === "0" || !/^\d+$/.test(s) || !/^\d+$/.test(i)) return null;
  return `https://shopee.co.th/product/${s}/${i}`;
}
