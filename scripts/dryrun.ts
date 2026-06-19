// ทดสอบ path ข้อมูลจริง: ดึงจาก BigQuery → วิเคราะห์ → aggregate (ไม่แตะ Supabase)
//   GOOGLE_APPLICATION_CREDENTIALS=... npm run dryrun [limit]
import "./_env";
import { aggregate } from "../src/lib/aggregate";
import { analyze } from "../src/lib/analyzer";
import { fetchNewComments } from "../src/lib/bigquery";

const limit = Number(process.argv[2] || 30);

async function main() {
  console.log(`ดึง ${limit} คอมเมนต์ล่าสุด (มีข้อความ) จาก BigQuery …`);
  const fresh = await fetchNewComments({ backfillDays: 90, limit });
  console.log(`ได้ ${fresh.length} แถว — ตัวอย่าง 2 แถว:`);
  console.log(JSON.stringify(fresh.slice(0, 2), null, 2));

  const analyzed = await analyze(fresh);
  const summary = aggregate(analyzed, 90);
  console.log("\n=== สรุป ===");
  console.log("ทิศทางรวม:", summary.overall.direction, `(${summary.overall.sentiment_score})`);
  console.log("ด่วน:", summary.urgent_total);
  console.log("แบรนด์:", summary.brands.map((b) => `${b.brand}:${b.sentiment_score}`).join(", "));
  console.log("หมวดปัญหา:", JSON.stringify(summary.overall.top_issues));
  if (summary.urgent[0]) console.log("ด่วนสุด:", summary.urgent[0].severity, summary.urgent[0].comment_text?.slice(0, 60));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
