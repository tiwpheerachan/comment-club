// ============================================================
//  ตัวเชื่อม Shopee Product API (ตอบกลับรีวิว/คอมเมนต์)
//  Proxy: POST {BASE}/api/v1/shopee/reply-comment  (header X-API-Key)
//  อ้างอิง: shopee-product-api.md (datacenter.shd-technology.co.th)
// ============================================================

export const REPLY_MAX_LEN = 500;   // Shopee จำกัดความยาวคำตอบ
export const REPLY_MAX_BATCH = 100;  // Shopee จำกัดต่อ 1 คำขอ

const DEFAULT_URL = "https://datacenter.shd-technology.co.th/api/v1/shopee/reply-comment";
export const SHOPEE_REPLY_URL = process.env.SHOPEE_REPLY_API_URL || DEFAULT_URL;
export const SHOPEE_REPLY_KEY = process.env.SHOPEE_REPLY_API_KEY || "";

export interface ReplyItem { comment_id: number; comment: string }

export interface ReplyOutcome {
  ok: boolean;            // มีอย่างน้อย 1 คอมเมนต์ที่ Shopee รับ
  httpStatus: number;
  accepted: number[];     // comment_id ที่ยืนยันใน result_list
  rejected: number[];     // ส่งไปแต่ไม่อยู่ใน result_list (เช่น คอมเมนต์ถูกลบ)
  error?: string;         // ข้อความอ่านง่าย (ภาษาไทย) เมื่อมีปัญหา
  retryAfterSec?: number; // เมื่อโดน rate limit (429)
  raw: string;            // body ดิบ (ตัดความยาว) เก็บไว้ debug
}

/** มีการตั้งค่า API key ไหม (ถ้าไม่มี = โหมดร่างอย่างเดียว) */
export const replyConfigured = () => Boolean(SHOPEE_REPLY_KEY);

interface ShopeeBody {
  error?: string;
  message?: string;
  detail?: string;
  response?: { result_list?: { comment_id?: number | string }[] };
}

/** แปลง HTTP status + body → ข้อความภาษาไทยที่ผู้ใช้เข้าใจ */
function explain(status: number, body: ShopeeBody | null, rawText: string): string {
  const detail = body?.detail || body?.error || body?.message || rawText.slice(0, 180);
  const lc = String(detail).toLowerCase();
  switch (status) {
    case 400:
      if (/no token record|token for shop|shop_id/.test(lc)) return "ยังไม่ได้เชื่อมต่อร้านนี้ (ไม่พบโทเคนของ shop_id) — เชื่อมต่อร้านใน Shopee ก่อน";
      if (/expired|revoked|invalid_access_token|error_token|error_auth/.test(lc)) return "โทเคน Shopee หมดอายุหรือถูกถอน — ต้องเชื่อมต่อร้านใหม่";
      return "ข้อมูลไม่ถูกต้อง: " + detail;
    case 401: return "API key ไม่ถูกต้องหรือไม่ได้ตั้งค่า (X-API-Key)";
    case 403: return "API key ไม่มีสิทธิ์ shopee_product หรือ shop_id ไม่อยู่ในขอบเขตของคีย์";
    case 429: return "ส่งถี่เกินไป (จำกัด 20 ครั้ง/นาที) — รอสักครู่แล้วลองใหม่";
    case 502: return "Shopee ขัดข้องชั่วคราว (502): " + detail;
    default:  return `เรียก API ไม่สำเร็จ (HTTP ${status}): ${detail}`;
  }
}

/**
 * ส่งคำตอบไปยัง Shopee จริงผ่าน proxy
 * @returns ผลลัพธ์รายตัว (accepted/rejected) + ข้อความ error ถ้ามี
 */
export async function replyToShopee(shopId: number, items: ReplyItem[]): Promise<ReplyOutcome> {
  const base: Omit<ReplyOutcome, "ok"> = { httpStatus: 0, accepted: [], rejected: [], raw: "" };

  if (!SHOPEE_REPLY_KEY) return { ok: false, ...base, error: "ยังไม่ได้ตั้งค่า SHOPEE_REPLY_API_KEY" };
  if (!shopId || !Number.isFinite(shopId)) return { ok: false, ...base, error: "ไม่พบ shop_id ที่ถูกต้อง" };

  // ตรวจ + ทำความสะอาด payload
  const clean: ReplyItem[] = [];
  for (const it of items) {
    const id = Number(it.comment_id);
    const comment = String(it.comment ?? "").trim();
    if (!id || !Number.isFinite(id)) return { ok: false, ...base, error: "comment_id ไม่ถูกต้อง" };
    if (!comment) return { ok: false, ...base, error: `คำตอบของคอมเมนต์ ${id} ว่างเปล่า` };
    if (comment.length > REPLY_MAX_LEN) return { ok: false, ...base, error: `คำตอบยาวเกิน ${REPLY_MAX_LEN} ตัวอักษร` };
    clean.push({ comment_id: id, comment });
  }
  if (clean.length === 0) return { ok: false, ...base, error: "ไม่มีคอมเมนต์ให้ตอบ" };
  if (clean.length > REPLY_MAX_BATCH) return { ok: false, ...base, error: `ตอบได้ครั้งละไม่เกิน ${REPLY_MAX_BATCH} คอมเมนต์` };

  let res: Response;
  try {
    res = await fetch(SHOPEE_REPLY_URL, {
      method: "POST",
      headers: { "X-API-Key": SHOPEE_REPLY_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ shop_id: shopId, comment_list: clean }),
    });
  } catch (e) {
    return { ok: false, ...base, error: "เชื่อมต่อ Shopee API ไม่สำเร็จ: " + (e instanceof Error ? e.message : String(e)) };
  }

  const rawText = (await res.text()).slice(0, 2000);
  let body: ShopeeBody | null = null;
  try { body = JSON.parse(rawText) as ShopeeBody; } catch { /* ไม่ใช่ JSON */ }
  const requested = clean.map((c) => c.comment_id);

  if (!res.ok) {
    const retry = res.headers.get("retry-after");
    return {
      ok: false, httpStatus: res.status, accepted: [], rejected: requested, raw: rawText,
      error: explain(res.status, body, rawText),
      retryAfterSec: retry ? Number(retry) || undefined : undefined,
    };
  }

  // HTTP 200 — แต่ Shopee อาจเงียบ ๆ ไม่รับบางคอมเมนต์ → เช็ค result_list
  const list = body?.response?.result_list ?? [];
  const accepted = list.map((r) => Number(r.comment_id)).filter((n) => Number.isFinite(n) && n > 0);
  const acceptedSet = new Set(accepted);
  const rejected = requested.filter((id) => !acceptedSet.has(id));

  // ถ้า Shopee ส่ง error field มาทั้งที่ HTTP 200
  if (body?.error) {
    return { ok: accepted.length > 0, httpStatus: 200, accepted, rejected, raw: rawText, error: "Shopee: " + body.error + (body.message ? " — " + body.message : "") };
  }

  return {
    ok: accepted.length > 0,
    httpStatus: 200,
    accepted,
    rejected,
    raw: rawText,
    error: rejected.length > 0 && accepted.length === 0 ? "Shopee ไม่รับคำตอบ (คอมเมนต์อาจถูกลบหรือ comment_id ไม่ถูกต้อง)" : undefined,
  };
}
