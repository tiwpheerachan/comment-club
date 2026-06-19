// ตัวช่วยจัดการข้อความ — กันปัญหา emoji/surrogate pair ที่ทำให้ JSON พัง
// (Shopee comments มี emoji เยอะ การ slice ตรง ๆ อาจตัดกลาง surrogate pair → lone surrogate → Postgres ปฏิเสธ json)

/** ลบ lone surrogate (ครึ่ง emoji) ที่ไม่มีคู่ — ป้องกัน "invalid input syntax for type json" */
export function stripLoneSurrogates(s: string): string {
  // ลบ high surrogate ที่ไม่ตามด้วย low / low ที่ไม่ตามหลัง high
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

/** ตัดข้อความตามจำนวน "ตัวอักษรจริง" (code points) โดยไม่ตัดกลาง emoji */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s); // แยกตาม code point (emoji = 1 ตัว)
  const cut = chars.length > max ? chars.slice(0, max).join("") : s;
  return stripLoneSurrogates(cut);
}

/** ทำความสะอาดค่าที่จะส่งขึ้น Supabase (กัน lone surrogate จากต้นทาง) */
export function clean(s: string | null): string | null {
  if (s == null) return null;
  return stripLoneSurrogates(s);
}
