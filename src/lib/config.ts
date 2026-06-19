// ============================================================
//  การตั้งค่าหลัก — แก้ที่นี่ที่เดียว ใช้ร่วมกันทั้ง pipeline และ API
//  ค่าที่อ่อนไหว (project/dataset/model) override ได้ผ่าน env
// ============================================================

export const BIGQUERY = {
  projectId: process.env.BQ_PROJECT_ID || "elated-channel-468406-t4",
  dataset: process.env.BQ_DATASET || "Platform",
  table: process.env.BQ_TABLE || "shopee_product_comments",
  location: process.env.BQ_LOCATION || "US",
};

// ------------------------------------------------------------
//  Mapping คอลัมน์ : key = ชื่อมาตรฐานในระบบ, value = ชื่อคอลัมน์จริงใน BigQuery
//  ** ตรงกับ schema จริงของ shopee_product_comments แล้ว **
//  หมายเหตุ: ตารางนี้ไม่มี "ชื่อสินค้า" มีแต่ item_id → ใช้ item_id เป็นตัวแทนสินค้า
// ------------------------------------------------------------
export const COLUMNS: Record<string, string | null> = {
  comment_id: "comment_id",
  brand: "brand_id",
  shop_name: null, // ไม่มีชื่อร้านในตาราง (มีแต่ shop_id)
  product_name: "item_id", // ไม่มีชื่อสินค้า → ใช้ item_id เป็นตัวแทน
  product_id: "item_id",
  rating: "rating_star",
  comment_text: "comment",
  username: "buyer_username",
  created_at: "ctime", // unix epoch (วินาที) — แปลงด้วย CREATED_AT_EXPR
  order_id: "order_sn",
};

// คอลัมน์เวลา (ctime) เป็น INT64 unix-seconds → ต้องแปลงเป็น TIMESTAMP ก่อนใช้กรอง/เรียง
export const CREATED_AT_EXPR = "TIMESTAMP_SECONDS(`ctime`)";

// ดึงเฉพาะคอมเมนต์ที่มีข้อความจริง (ตารางนี้ ~80% เป็นดาวล้วนไม่มีข้อความ → ข้ามเพื่อประหยัด)
export const TEXT_ONLY_WHERE = "comment IS NOT NULL AND comment != ''";

export const URGENT_RULES = {
  rating_threshold: 2, // ดาว <= ค่านี้ = เสี่ยง
  severity_threshold: 7, // ความรุนแรง AI >= ค่านี้ = ด่วน

  // "อันตราย/โกง/กฎหมาย" — ติดธงด่วนเสมอ แม้รีวิวจะดูเป็นบวก (ความปลอดภัยต้องมาก่อน)
  hard_danger_keywords: [
    "หลอกลวง", "โกง", "ของปลอม", "ไม่ได้ของ", "ฟ้องร้อง", "สคบ", "ทนายความ",
    "แพ้", "ผื่น", "อันตราย", "หมดอายุ", "ขึ้นรา", "เน่า", "ไฟไหม้", "ระเบิด", "ช็อต",
    "scam", "fake", "lawyer", "dangerous", "expired",
  ],

  // ปัญหาทั่วไป — ยกระดับเป็นด่วน "เฉพาะเมื่อไม่ใช่รีวิวบวก" (กัน false positive)
  // หมายเหตุ: เลี่ยงคำกว้างอย่าง "เงียบ" (ชน "เสียงเงียบดี") → ใช้วลีเจาะจงแทน
  soft_flag_keywords: [
    "ไม่ส่ง", "ทักแล้วเงียบ", "ตอบแล้วเงียบ", "เงียบหาย", "ติดต่อไม่ได้",
    "ไม่ตอบแชท", "รีฟัน", "คืนเงิน", "ขอเงินคืน", "refund",
  ],
};

// รวมไว้ให้โค้ดเดิม/หน้า settings ใช้แสดงจำนวน
export const RED_FLAG_KEYWORDS = [
  ...URGENT_RULES.hard_danger_keywords,
  ...URGENT_RULES.soft_flag_keywords,
];

export const ISSUE_CATEGORIES = [
  "คุณภาพสินค้า",
  "การจัดส่ง",
  "การบริการ/แอดมิน",
  "ราคา/โปรโมชั่น",
  "บรรจุภัณฑ์",
  "ความปลอดภัย/สุขภาพ",
  "การชำระเงิน",
  "อื่น ๆ",
  "เชิงบวก/ชม",
];

export const POSITIVE_CATEGORY = "เชิงบวก/ชม";

export const AI = {
  model: process.env.AI_MODEL || "claude-sonnet-4-6",
  batchSize: Number(process.env.AI_BATCH_SIZE || 10),
  maxTokens: Number(process.env.AI_MAX_TOKENS || 8192),
  // จำนวน batch ที่เรียก Claude พร้อมกัน (เร่ง backfill — ระวัง rate limit)
  concurrency: Number(process.env.AI_CONCURRENCY || 5),
  enabled: process.env.AI_ENABLED !== "false",
};

export const PIPELINE = {
  // หน้าต่างเวลาที่ dashboard สรุป (เช่น 30 วันล่าสุด)
  windowDays: Number(process.env.WINDOW_DAYS || 30),
  // ดึงย้อนหลังเผื่อ overlap จาก watermark (กันคอมเมนต์ตกหล่นช่วงคาบเกี่ยว)
  overlapMinutes: Number(process.env.OVERLAP_MINUTES || 60),
  // ครั้งแรกที่ตารางว่าง ดึงย้อนหลังกี่วัน
  initialBackfillDays: Number(process.env.INITIAL_BACKFILL_DAYS || 30),
  // จำกัดจำนวนต่อรอบ (กันค่าใช้จ่ายพุ่ง, 0 = ไม่จำกัด)
  maxPerRun: Number(process.env.MAX_PER_RUN || 0),
};

/** secret สำหรับป้องกัน endpoint /api/pipeline (ตั้งใน env) */
export const PIPELINE_SECRET = process.env.PIPELINE_SECRET || "";

export const STD_FIELDS = [
  "comment_id", "brand", "shop_name", "product_name", "product_id",
  "rating", "comment_text", "username", "created_at", "order_id",
] as const;
