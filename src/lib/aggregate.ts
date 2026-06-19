// สรุปผล (aggregate) ภาพรวม + รายแบรนด์ + คิวด่วน — mirror logic เดิมจาก Python
import { POSITIVE_CATEGORY } from "./config";
import type { AnalyzedComment, BrandSummary, Sentiment, Summary, UrgentItem } from "./types";

const NO_BRAND = "ไม่ระบุแบรนด์";

function emptySent(): Record<Sentiment, number> {
  return { positive: 0, neutral: 0, negative: 0 };
}

function sentimentScore(s: Record<Sentiment, number>): number {
  const total = s.positive + s.neutral + s.negative;
  if (total === 0) return 0;
  return Math.round(((s.positive - s.negative) / total) * 100 * 10) / 10;
}

export function directionLabel(score: number): string {
  if (score >= 40) return "ดีมาก";
  if (score >= 15) return "ค่อนข้างดี";
  if (score > -15) return "ทรงตัว/ผสม";
  if (score > -40) return "ค่อนข้างแย่";
  return "แย่ ต้องรีบแก้";
}

function topN(counter: Map<string, number>, n: number) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([category, count]) => ({ category, count }));
}

interface BrandAcc {
  sentiment: Record<Sentiment, number>;
  category: Map<string, number>;
  issues: Map<string, number>;
  ratings: number[];
  count: number;
}

export function aggregate(results: AnalyzedComment[], windowDays: number): Summary {
  const overallSent = emptySent();
  const overallCat = new Map<string, number>();
  const overallIssues = new Map<string, number>(); // เฉพาะ negative
  const byBrand = new Map<string, BrandAcc>();
  const urgent: UrgentItem[] = [];
  const overallRatings: number[] = [];
  const ratingDist: Record<"1" | "2" | "3" | "4" | "5", number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);

  for (const r of results) {
    const brand = r.brand || NO_BRAND;
    const sent = r.sentiment || "neutral";
    const cat = r.category || "อื่น ๆ";

    overallSent[sent] += 1;
    bump(overallCat, cat);
    if (sent === "negative" && cat !== POSITIVE_CATEGORY) bump(overallIssues, cat);

    let b = byBrand.get(brand);
    if (!b) {
      b = { sentiment: emptySent(), category: new Map(), issues: new Map(), ratings: [], count: 0 };
      byBrand.set(brand, b);
    }
    b.sentiment[sent] += 1;
    bump(b.category, cat);
    b.count += 1;
    if (sent === "negative" && cat !== POSITIVE_CATEGORY) bump(b.issues, cat);
    if (r.rating != null && Number.isFinite(r.rating)) {
      b.ratings.push(r.rating);
      overallRatings.push(r.rating);
      const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
      ratingDist[String(star) as "1" | "2" | "3" | "4" | "5"] += 1;
    }

    if (r.urgent) {
      urgent.push({
        comment_id: r.comment_id,
        brand: r.brand,
        product_name: r.product_name,
        rating: r.rating,
        username: r.username,
        created_at: r.created_at,
        comment_text: r.comment_text,
        category: cat,
        severity: r.severity,
        suggested_action: r.suggested_action,
        images: r.images ?? [],
      });
    }
  }

  urgent.sort((a, b) => b.severity - a.severity);

  const brands: BrandSummary[] = [...byBrand.entries()].map(([brand, b]) => {
    const score = sentimentScore(b.sentiment);
    const avg = b.ratings.length
      ? Math.round((b.ratings.reduce((x, y) => x + y, 0) / b.ratings.length) * 100) / 100
      : null;
    return {
      brand,
      count: b.count,
      sentiment: b.sentiment,
      sentiment_score: score,
      direction: directionLabel(score),
      avg_rating: avg,
      top_issues: topN(b.issues, 5),
      urgent_count: urgent.filter((u) => (u.brand || NO_BRAND) === brand).length,
    };
  });
  // แบรนด์ที่แย่สุดอยู่บน
  brands.sort((a, b) => a.sentiment_score - b.sentiment_score);

  const overallScore = sentimentScore(overallSent);
  const overallAvg = overallRatings.length
    ? Math.round((overallRatings.reduce((x, y) => x + y, 0) / overallRatings.length) * 100) / 100
    : null;
  return {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    total_comments: results.length,
    overall: {
      sentiment: overallSent,
      sentiment_score: overallScore,
      direction: directionLabel(overallScore),
      avg_rating: overallAvg,
      rating_dist: ratingDist,
      top_categories: topN(overallCat, 8),
      top_issues: topN(overallIssues, 8),
    },
    brands,
    urgent: urgent.slice(0, 100),
    urgent_total: urgent.length,
  };
}
