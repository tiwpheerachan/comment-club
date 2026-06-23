// ชนิดข้อมูลกลางที่ใช้ร่วมกันทั้ง pipeline และ dashboard

export type Sentiment = "positive" | "neutral" | "negative";

/** คอมเมนต์ดิบที่ map มาจาก BigQuery (ชื่อ field เป็นมาตรฐานของระบบ) */
export interface RawComment {
  comment_id: string;
  brand: string | null;
  shop_id: string | null;
  shop_name: string | null;
  product_name: string | null;
  product_id: string | null;
  rating: number | null;
  comment_text: string | null;
  username: string | null;
  created_at: string | null; // ISO string
  order_id: string | null;
  seller_reply: string | null;       // คำตอบจากผู้ขายที่ตอบไปแล้วบน Shopee
  seller_reply_at: string | null;    // ISO เวลาที่ผู้ขายตอบ
  seller_reply_hidden: boolean | null; // คำตอบถูกซ่อนบน Shopee หรือไม่
  images: string[]; // URL รูปที่ลูกค้าแนบ (Shopee CDN)
}

/** ผลวิเคราะห์ต่อ 1 คอมเมนต์ */
export interface Analysis {
  sentiment: Sentiment;
  category: string;
  severity: number; // 0-10
  summary: string;
  suggested_action: string;
  urgent: boolean;
  analyzed_by: "ai" | "rule";
}

/** คอมเมนต์ + ผลวิเคราะห์ (แถวที่เก็บลง Supabase) */
export type AnalyzedComment = RawComment & Analysis & { model: string | null };

export interface BrandSummary {
  brand: string;
  count: number;
  sentiment: Record<Sentiment, number>;
  sentiment_score: number; // -100..100
  direction: string;
  avg_rating: number | null;
  top_issues: { category: string; count: number }[];
  urgent_count: number;
}

export interface UrgentItem {
  comment_id: string | null;
  brand: string | null;
  shop_id: string | null;
  product_name: string | null;
  rating: number | null;
  username: string | null;
  created_at: string | null;
  comment_text: string | null;
  category: string;
  severity: number;
  suggested_action: string;
  seller_reply: string | null;
  seller_reply_at: string | null;
  seller_reply_hidden: boolean | null;
  images: string[];
}

export interface Summary {
  generated_at: string;
  window_days: number;
  total_comments: number;
  overall: {
    sentiment: Record<Sentiment, number>;
    sentiment_score: number;
    direction: string;
    avg_rating: number | null;
    /** จำนวนคอมเมนต์ต่อจำนวนดาว 1–5 */
    rating_dist: Record<"1" | "2" | "3" | "4" | "5", number>;
    top_categories: { category: string; count: number }[];
    /** เฉพาะคอมเมนต์เชิงลบ — ใช้ในแผง "สิ่งที่ต้องแก้" */
    top_issues: { category: string; count: number }[];
  };
  brands: BrandSummary[];
  urgent: UrgentItem[];
  urgent_total: number;
}

export interface TrendPoint {
  date: string;
  overall_score: number;
  total: number;
  urgent: number;
  brands: Record<string, number>;
}
