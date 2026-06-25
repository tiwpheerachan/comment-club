// ============================================================
//  จำแนกประเภทสินค้า → เลือก "ปัจจัยพยากรณ์ที่เกี่ยวข้องจริง"
//  เหตุผล: สภาพอากาศ/ฝุ่นไม่ได้เกี่ยวกับสินค้าทุกชนิด
//    เช่น สายชาร์จ/หูฟัง ไม่ได้ขายดีเพราะฝุ่น — การโยงคือ correlation ลวง
//    ระบบจึงต้องรู้ว่าสินค้านี้คืออะไร แล้วพิจารณาเฉพาะปัจจัยที่ "มีเหตุผลเชิงสาเหตุ"
// ============================================================

export type WeatherFactor = "pm2_5" | "temp_mean" | "precip";

export interface ProductCategory {
  key: string;
  label: string;                 // ชื่อประเภทภาษาไทย
  weatherFactors: WeatherFactor[]; // ปัจจัยอากาศที่ "อาจ" เกี่ยวข้อง (ว่าง = ไม่เกี่ยวอากาศ)
  driverHint: string;            // ปัจจัยหลักที่ควรโฟกัสสำหรับสินค้าประเภทนี้
}

// กฎจับคู่คำสำคัญ (ไทย+อังกฤษ) — เรียงจาก "เฉพาะเจาะจง" ไป "กว้าง" (ตัวแรกที่ match ชนะ)
interface Rule { key: string; label: string; weatherFactors: WeatherFactor[]; driverHint: string; kw: string[] }
const RULES: Rule[] = [
  {
    key: "health_air", label: "สุขภาพ/อากาศ", weatherFactors: ["pm2_5"],
    driverHint: "ฝุ่น PM2.5 และฤดูกาลมลพิษเป็นตัวขับเคลื่อนหลัก",
    kw: ["หน้ากาก", "mask", "n95", "kf94", "ฟอกอากาศ", "air purifier", "purifier", "แผ่นกรอง", "filter", "ยาดม", "เครื่องวัดฝุ่น", "อากาศ"],
  },
  {
    key: "skincare_beauty", label: "ความงาม/สกินแคร์", weatherFactors: ["temp_mean"],
    driverHint: "อุณหภูมิ/ฤดู (ร้อน-แดด) และแคมเปญความงามมีผล",
    kw: ["กันแดด", "sunscreen", "spf", "ครีม", "cream", "โลชั่น", "lotion", "เซรั่ม", "serum", "บำรุงผิว", "มาส์ก", "mask sheet", "ลิป", "lip", "แป้ง", "รองพื้น", "เครื่องสำอาง", "cosmetic", "makeup", "บำรุง", "essence", "moistur"],
  },
  {
    key: "apparel_fashion", label: "เสื้อผ้า/แฟชั่น", weatherFactors: ["temp_mean", "precip"],
    driverHint: "อุณหภูมิ/ฝน (ตามฤดู) และเทรนด์แฟชั่น/แคมเปญ",
    kw: ["เสื้อ", "shirt", "กางเกง", "pants", "เดรส", "dress", "กระโปรง", "skirt", "รองเท้า", "shoe", "sneaker", "แจ็คเก็ต", "jacket", "เสื้อกันหนาว", "hoodie", "ชุด", "ถุงเท้า", "หมวก", "เสื้อกันฝน", "ร่ม", "umbrella"],
  },
  {
    key: "home_cooling", label: "เครื่องใช้ทำความเย็น", weatherFactors: ["temp_mean"],
    driverHint: "อุณหภูมิ (ยิ่งร้อนยิ่งขายดี) เป็นตัวขับเคลื่อนชัด",
    kw: ["พัดลม", "fan", "แอร์", "เครื่องปรับอากาศ", "air condition", "พัดลมไอเย็น", "cooler", "เครื่องทำน้ำเย็น"],
  },
  {
    key: "supplement_med", label: "วิตามิน/อาหารเสริม", weatherFactors: ["pm2_5"],
    driverHint: "ฤดูป่วย/มลพิษมีผลบ้าง แต่ขับเคลื่อนหลักด้วยรีวิว/แบรนด์",
    kw: ["วิตามิน", "vitamin", "อาหารเสริม", "supplement", "คอลลาเจน", "collagen", "ยา ", "เวย์", "whey", "โปรตีน", "protein"],
  },
  {
    key: "food_beverage", label: "อาหาร/เครื่องดื่ม", weatherFactors: ["temp_mean"],
    driverHint: "อุณหภูมิมีผลบ้าง (เครื่องดื่มเย็น) ขับเคลื่อนหลักด้วยโปร/รีวิว",
    kw: ["ขนม", "snack", "เครื่องดื่ม", "กาแฟ", "coffee", "ชา ", "นม", "milk", "อาหาร", "food", "น้ำ", "ลูกอม", "ช็อกโกแลต"],
  },
  {
    key: "electronics", label: "อุปกรณ์อิเล็กทรอนิกส์", weatherFactors: [],
    driverHint: "ไม่ขึ้นกับสภาพอากาศ — ขับเคลื่อนด้วยเทรนด์ แคมเปญ ราคา และรีวิว",
    kw: ["สายชาร์จ", "cable", "ชาร์จ", "charger", "อะแดปเตอร์", "adapter", "powerbank", "พาวเวอร์แบงค์", "power bank", "หูฟัง", "earbud", "earphone", "headphone", "ลำโพง", "speaker", "เคส", "case", "ฟิล์ม", "screen protector", "เมาส์", "mouse", "keyboard", "คีย์บอร์ด", "usb", "type-c", "type c", "hub", "iphone", "ipad", "samsung", "notebook", "laptop", "tablet", "โทรศัพท์", "มือถือ", "android", "charge", "watt", "240w", "gan"],
  },
];

const GENERIC: ProductCategory = {
  key: "generic", label: "ทั่วไป", weatherFactors: [],
  driverHint: "ยังจำแนกประเภทไม่ได้ — พิจารณาเทรนด์/แคมเปญ/รีวิวเป็นหลัก และทดสอบปัจจัยอากาศตามนัยสำคัญ",
};

/** จำแนกประเภทสินค้าจากชื่อ (+แบรนด์ช่วยเสริม) */
export function categorize(name: string | null, brand?: string | null): ProductCategory {
  const text = `${name ?? ""} ${brand ?? ""}`.toLowerCase();
  if (!text.trim()) return GENERIC;
  for (const r of RULES) {
    if (r.kw.some((k) => text.includes(k.toLowerCase()))) {
      return { key: r.key, label: r.label, weatherFactors: r.weatherFactors, driverHint: r.driverHint };
    }
  }
  return GENERIC;
}

export const FACTOR_LABEL: Record<WeatherFactor, string> = { pm2_5: "ฝุ่น PM2.5", temp_mean: "อุณหภูมิ", precip: "ปริมาณฝน" };
