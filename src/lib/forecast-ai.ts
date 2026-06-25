// ============================================================
//  บทวิเคราะห์พยากรณ์ด้วย AI (Claude)
//  รวม "ตัวเลขที่คำนวณแล้ว" จากทุก engine (โมเดล/ดีมานด์/ราคา/รีวิว/แคมเปญ/สต๊อก)
//  → ให้ Claude เรียบเรียงเป็นบทความสั้นภาษาไทย พร้อมคำแนะนำที่ลงมือได้
//  หลักการ: AI ห้ามแต่งตัวเลขเอง ใช้ได้เฉพาะข้อมูลที่ส่งให้ (กัน hallucination)
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { AI } from "./config";

export interface BriefInput {
  kind: "product" | "sales";
  title: string;                 // ชื่อสินค้า / ขอบเขตยอดขาย
  facts: Record<string, unknown>; // ตัวเลข/ผลวิเคราะห์ที่คำนวณแล้ว
}

export interface BriefResult {
  ok: boolean;
  article?: string;   // markdown ภาษาไทย
  error?: string;
  model?: string;
}

const SYSTEM_PROMPT = `คุณเป็นนักวิเคราะห์ข้อมูลอีคอมเมิร์ซมืออาชีพสำหรับผู้ขายบน Shopee/TikTok Shop ในไทย
หน้าที่: อ่าน "ผลวิเคราะห์เชิงตัวเลขที่ให้มา" แล้วเรียบเรียงเป็น "บทวิเคราะห์สั้น" ภาษาไทยที่ผู้บริหารร้านอ่านแล้วตัดสินใจได้ทันที

กฎเหล็ก:
- ใช้ได้เฉพาะตัวเลข/ข้อเท็จจริงใน JSON ที่ให้มาเท่านั้น ห้ามแต่งตัวเลขหรือสมมติข้อมูลที่ไม่มี
- ถ้าข้อมูลบางส่วนเป็น null/ไม่มี ให้บอกตรง ๆ ว่ายังไม่มีข้อมูล อย่าเดา
- กระชับ ตรงประเด็น ใช้ภาษาธุรกิจที่เข้าใจง่าย (ไม่ต้องอธิบายศัพท์สถิติยาว)
- โฟกัส "แล้วต้องทำอะไรต่อ" มากกว่าอธิบายตัวเลข
- ความยาวรวมไม่เกิน ~220 คำ

รูปแบบผลลัพธ์ (markdown ล้วน ไม่ต้องมีหัวเรื่องใหญ่ซ้ำชื่อสินค้า):
**📊 สถานการณ์** — 1-2 ประโยคสรุปภาพรวมยอดขาย/แนวโน้ม/สต๊อก
**🔑 ปัจจัยขับเคลื่อน** — bullet 2-4 ข้อ ปัจจัยที่มีผลจริง (ตัดปัจจัยที่ไม่เกี่ยว/ไม่มีนัยสำคัญทิ้ง)
**⚠️ ความเสี่ยง** — bullet 1-3 ข้อ (ของหมด/ยอดตก/รีวิวลบ ฯลฯ) ถ้าไม่มีให้บอกว่าไม่มีนัยสำคัญ
**✅ สิ่งที่ควรทำ** — bullet 2-4 ข้อ เป็นคำสั่งที่ลงมือได้ พร้อมตัวเลขประกอบถ้ามี`;

function buildPrompt(input: BriefInput): string {
  const scope = input.kind === "product" ? `สินค้า: "${input.title}"` : `ขอบเขตยอดขาย: "${input.title}"`;
  return `${scope}

ผลวิเคราะห์เชิงตัวเลข (JSON):
\`\`\`json
${JSON.stringify(input.facts, null, 2)}
\`\`\`

เขียนบทวิเคราะห์สั้นตามรูปแบบที่กำหนด โดยใช้เฉพาะข้อมูลข้างต้น`;
}

/** เรียก Claude สร้างบทวิเคราะห์ (คืน markdown) */
export async function generateForecastBrief(input: BriefInput): Promise<BriefResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY" };
  try {
    const anthropic = new Anthropic();
    const resp = await anthropic.messages.create({
      model: AI.model,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
    const block = resp.content[0];
    const article = block && block.type === "text" ? block.text.trim() : "";
    if (!article) return { ok: false, error: "AI ไม่ได้ส่งข้อความกลับมา" };
    return { ok: true, article, model: AI.model };
  } catch (e) {
    console.error("[forecast-ai] เรียก AI ไม่สำเร็จ:", e);
    return { ok: false, error: e instanceof Error ? e.message : "เรียก AI ไม่สำเร็จ" };
  }
}
