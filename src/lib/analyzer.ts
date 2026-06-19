// วิเคราะห์คอมเมนต์ทีละชุด (batch) ด้วย Claude + fallback rule-based + บังคับกฎ urgent
import Anthropic from "@anthropic-ai/sdk";
import { AI, ISSUE_CATEGORIES, POSITIVE_CATEGORY, URGENT_RULES } from "./config";
import { truncate } from "./text";
import type { Analysis, AnalyzedComment, RawComment, Sentiment } from "./types";

// ---------- rule-based (สำรอง/ทดสอบฟรี) ----------

const POSITIVE_WORDS = [
  "ดี", "ชอบ", "ประทับใจ", "คุ้ม", "เร็ว", "สวย", "ของแท้", "แนะนำ",
  "ถูกใจ", "ใช้ดี", "ตรงปก", "บริการดี", "great", "good", "love", "nice",
];
const NEGATIVE_WORDS = [
  "แย่", "ห่วย", "ช้า", "พัง", "เสีย", "ผิด", "ไม่ดี", "ไม่ตรงปก",
  "ปลอม", "โกง", "หลอก", "ผิดหวัง", "แพง", "bad", "terrible", "slow", "broken",
];

function ruleSentiment(text: string, rating: number | null): Sentiment {
  const t = (text || "").toLowerCase();
  let score = 0;
  // จัดการการปฏิเสธ: "ไม่<คำบวก>" = ลบ, "ไม่<คำลบ>" = บวก (เช่น "ไม่แพง" = ดี)
  for (const w of POSITIVE_WORDS) {
    if (t.includes("ไม่" + w)) score -= 1;
    else if (t.includes(w)) score += 1;
  }
  for (const w of NEGATIVE_WORDS) {
    if (t.includes("ไม่" + w)) score += 1;
    else if (t.includes(w)) score -= 1;
  }
  if (rating != null && Number.isFinite(rating)) {
    if (rating >= 4) score += 1;
    else if (rating <= 2) score -= 2;
  }
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

function hitsAny(text: string, keywords: string[]): boolean {
  const t = (text || "").toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

// ---------- จำแนกหมวดแบบ keyword (ฉลาดขึ้นโดยไม่ต้องใช้ AI) ----------
const CATEGORY_KEYWORDS: { cat: string; words: string[] }[] = [
  { cat: "ความปลอดภัย/สุขภาพ", words: ["แพ้", "ผื่น", "คัน", "ระคายเคือง", "อันตราย", "หมดอายุ", "เน่า", "ขึ้นรา", "บวม", "แสบ", "ปวด"] },
  { cat: "การจัดส่ง", words: ["ส่ง", "จัดส่ง", "ขนส่ง", "พัสดุ", "ช้า", "นาน", "ไม่ได้ของ", "ของหาย", "ตกหล่น", "kerry", "flash", "ล่าช้า", "ส่งผิด", "รอนาน", "ส่งเร็ว", "ส่งไว"] },
  { cat: "บรรจุภัณฑ์", words: ["กล่อง", "แพ็ค", "ห่อ", "บุบ", "บรรจุภัณฑ์", "ซีล", "แตกหัก", "หีบห่อ", "กันกระแทก"] },
  { cat: "การชำระเงิน", words: ["จ่าย", "ชำระ", "โอน", "เก็บเงินปลายทาง", "ปลายทาง", "payment", "บัตร", "หักเงิน", "คิดเงิน"] },
  { cat: "ราคา/โปรโมชั่น", words: ["ราคา", "แพง", "ถูก", "โปร", "ส่วนลด", "คูปอง", "คุ้ม", "โปรโมชั่น", "ลดราคา", "แถม"] },
  { cat: "การบริการ/แอดมิน", words: ["แอดมิน", "ตอบ", "บริการ", "ทักแชท", "ไม่ตอบ", "มารยาท", "พูดจา", "ร้านดี", "ร้านน่ารัก", "ตอบเร็ว", "ตอบช้า"] },
  { cat: "คุณภาพสินค้า", words: ["พัง", "เสีย", "ชำรุด", "แตก", "ไม่ตรงปก", "ปลอม", "ของแท้", "คุณภาพ", "ใช้ไม่ได้", "ห่วย", "ของดี", "ใช้ดี", "ตรงปก", "งานดี", "ของไม่ดี", "ไม่เหมือนรูป"] },
];

/** เดาหมวดจากคำในข้อความ — คืน null ถ้าไม่เข้าเกณฑ์ */
function classifyCategory(text: string): string | null {
  const t = (text || "").toLowerCase();
  let best: { cat: string; score: number } | null = null;
  for (const { cat, words } of CATEGORY_KEYWORDS) {
    const score = words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { cat, score };
  }
  return best?.cat ?? null;
}
const hitsHardDanger = (t: string) => hitsAny(t, URGENT_RULES.hard_danger_keywords);
const hitsSoftFlag = (t: string) => hitsAny(t, URGENT_RULES.soft_flag_keywords);

export function ruleBasedOne(c: RawComment): Analysis {
  const text = c.comment_text || "";
  const rating = c.rating;
  const sentiment = ruleSentiment(text, rating);

  let severity = 0;
  if (sentiment === "negative") severity = 6;

  return {
    sentiment,
    category: sentiment === "positive" ? POSITIVE_CATEGORY : (classifyCategory(text) ?? "อื่น ๆ"),
    severity,
    summary: truncate(text, 80),
    suggested_action: "",
    urgent: false, // ปล่อยให้ merge() ตัดสิน urgent ที่เดียว (กันตรรกะซ้อน)
    analyzed_by: "rule",
  };
}

// ---------- AI (Claude) ----------

const SYSTEM_PROMPT = `คุณคือผู้ช่วยวิเคราะห์รีวิว/คอมเมนต์ลูกค้าของร้านค้าบน Shopee
หน้าที่ของคุณคืออ่านคอมเมนต์แต่ละรายการแล้วประเมินอย่างเป็นกลางและแม่นยำ
ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON`;

function buildPrompt(batch: RawComment[]): string {
  const items = batch
    .map(
      (c, i) =>
        `[${i}] แบรนด์: ${c.brand} | สินค้า: ${c.product_name} | ดาว: ${c.rating} | ข้อความ: ${c.comment_text}`
    )
    .join("\n");
  const catList = ISSUE_CATEGORIES.map((c) => `"${c}"`).join(", ");
  return `วิเคราะห์คอมเมนต์ต่อไปนี้ทีละรายการ (index ตรงกับเลขในวงเล็บ):

${items}

สำหรับแต่ละรายการให้คืน object ที่มี field:
- "index": เลข index (int)
- "sentiment": หนึ่งใน "positive" / "neutral" / "negative"
- "category": เลือกจาก [${catList}]
- "severity": 0-10 (0=ไม่มีปัญหา, 10=วิกฤตต้องรีบแก้ทันที เช่น แพ้/อันตราย/ถูกโกง)
- "summary": สรุปประเด็นสั้น ๆ เป็นภาษาไทย ไม่เกิน 100 ตัวอักษร
- "suggested_action": สิ่งที่ทีมควรทำต่อ เป็นภาษาไทย (ถ้าเป็นคอมเมนต์เชิงบวกให้เว้นว่าง "")
- "urgent": true เฉพาะกรณีที่ทีมต้องรีบเข้าไปช่วยเหลือ/แก้ไขโดยเร็ว (เช่น ปัญหาความปลอดภัย ลูกค้าโกรธมาก ขู่ฟ้อง ไม่ได้รับของ)

ตอบเป็น JSON object เดียวรูปแบบ: {"results": [ ... ]} โดยเรียงตาม index`;
}

interface AiResult {
  index?: number;
  sentiment?: Sentiment;
  category?: string;
  severity?: number;
  summary?: string | null;
  suggested_action?: string | null;
  urgent?: boolean;
}

function extractJson(raw: string): { results?: AiResult[] } | null {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function aiAnalyzeBatch(batch: RawComment[]): Promise<AiResult[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic();
  try {
    const resp = await anthropic.messages.create({
      model: AI.model,
      max_tokens: AI.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(batch) }],
    });
    const block = resp.content[0];
    const raw = block.type === "text" ? block.text : "";
    const parsed = extractJson(raw);
    if (!parsed || !parsed.results) return null;
    return parsed.results;
  } catch (e) {
    console.error("[analyzer] เรียก AI ไม่สำเร็จ:", e);
    return null;
  }
}

/** รวมผล AI/rule เข้ากับ enrichment + บังคับกฎ urgent จาก config (กันโมเดลพลาดเคสด่วน) */
function merge(base: RawComment, a: AiResult | Analysis, by: "ai" | "rule"): AnalyzedComment {
  const text = base.comment_text || "";
  const rating = base.rating;

  const sentiment = (a.sentiment as Sentiment) || "neutral";
  let severity = Math.trunc(Number(a.severity ?? 0) || 0);
  let urgent = Boolean(a.urgent);

  const hard = hitsHardDanger(text);
  const soft = hitsSoftFlag(text);
  const lowRating = rating != null && Number.isFinite(rating) && rating <= URGENT_RULES.rating_threshold;

  // ยกระดับความรุนแรง/ธงด่วนจาก config (safety net ทับผล AI)
  if (hard) {
    urgent = true;
    severity = Math.max(severity, 9);
  } else if (soft) {
    urgent = true;
    severity = Math.max(severity, 8);
  }
  if (lowRating) {
    urgent = true;
    severity = Math.max(severity, 7);
  }
  if (severity >= URGENT_RULES.severity_threshold) urgent = true;

  // ปลดธงด่วน false positive: รีวิวที่ให้ดาวสูง (>=4) แทบไม่มีทางเป็นเคสฉุกเฉิน
  // ภาษาไทยไม่มีเว้นวรรค การจับคำแบบ substring ชนพลาดบ่อย เช่น "ภูมิแพ้หายไป"(ชน "แพ้"), "ไม่แพง"(ชน "แพง")
  // → เชื่อดาว/sentiment มากกว่า keyword
  const ratingNum = rating != null && Number.isFinite(rating) ? Number(rating) : null;
  if (urgent && ((ratingNum != null && ratingNum >= 4) || (ratingNum == null && sentiment === "positive"))) {
    urgent = false;
    severity = Math.min(severity, 4);
  }

  const category = a.category && ISSUE_CATEGORIES.includes(a.category) ? a.category : "อื่น ๆ";

  return {
    ...base,
    sentiment,
    category,
    severity,
    summary: truncate(a.summary || "", 120),
    suggested_action: truncate(a.suggested_action || "", 300),
    urgent,
    analyzed_by: by,
    model: by === "ai" ? AI.model : null,
  };
}

function analyzeOneBatch(batch: RawComment[], aiResults: AiResult[] | null): AnalyzedComment[] {
  if (aiResults) {
    const byIndex = new Map<number, AiResult>();
    for (const r of aiResults) {
      if (typeof r.index === "number") byIndex.set(r.index, r);
    }
    return batch.map((c, i) => {
      const ai = byIndex.get(i);
      return ai ? merge(c, ai, "ai") : merge(c, ruleBasedOne(c), "rule");
    });
  }
  return batch.map((c) => merge(c, ruleBasedOne(c), "rule"));
}

/** วิเคราะห์คอมเมนต์ทั้งหมด คืน list ที่ enrich แล้ว (เรียก Claude หลาย batch พร้อมกันเพื่อความเร็ว) */
export async function analyze(
  comments: RawComment[],
  onProgress?: (done: number, total: number) => void
): Promise<AnalyzedComment[]> {
  const batchSize = AI.batchSize;
  const batches: RawComment[][] = [];
  for (let s = 0; s < comments.length; s += batchSize) batches.push(comments.slice(s, s + batchSize));

  const out: AnalyzedComment[] = new Array(comments.length);
  const concurrency = AI.enabled ? Math.max(1, AI.concurrency) : 1;
  let next = 0;
  let done = 0;

  async function worker() {
    while (next < batches.length) {
      const idx = next++;
      const batch = batches[idx];
      const aiResults = AI.enabled ? await aiAnalyzeBatch(batch) : null;
      const merged = analyzeOneBatch(batch, aiResults);
      // วางผลกลับตำแหน่งเดิม
      merged.forEach((m, j) => (out[idx * batchSize + j] = m));
      done += batch.length;
      onProgress?.(done, comments.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return out;
}
