// สำรวจ schema จริงของตาราง BigQuery + ดึงตัวอย่างไม่กี่แถว
// ใช้หลังตั้งค่า GOOGLE_APPLICATION_CREDENTIALS แล้ว:  npm run introspect
import "./_env";
import { BigQuery } from "@google-cloud/bigquery";
import { BIGQUERY } from "../src/lib/config";

async function main() {
  const bq = new BigQuery({ projectId: BIGQUERY.projectId, location: BIGQUERY.location });
  const fq = `\`${BIGQUERY.projectId}.${BIGQUERY.dataset}.${BIGQUERY.table}\``;

  console.log(`\n📋 schema ของ ${BIGQUERY.projectId}.${BIGQUERY.dataset}.${BIGQUERY.table}\n`);
  const [cols] = await bq.query({
    query: `
      SELECT column_name, data_type, is_nullable
      FROM \`${BIGQUERY.projectId}.${BIGQUERY.dataset}\`.INFORMATION_SCHEMA.COLUMNS
      WHERE table_name = @t
      ORDER BY ordinal_position`,
    params: { t: BIGQUERY.table },
    location: BIGQUERY.location,
  });
  for (const c of cols as { column_name: string; data_type: string; is_nullable: string }[]) {
    console.log(`  ${c.column_name.padEnd(28)} ${c.data_type.padEnd(14)} ${c.is_nullable === "YES" ? "null" : "not null"}`);
  }

  const [cnt] = await bq.query({ query: `SELECT COUNT(*) AS n FROM ${fq}`, location: BIGQUERY.location });
  console.log(`\n🔢 จำนวนแถวทั้งหมด: ${(cnt as { n: number }[])[0]?.n}`);

  console.log(`\n🔎 ตัวอย่าง 3 แถวล่าสุด:\n`);
  const [rows] = await bq.query({ query: `SELECT * FROM ${fq} LIMIT 3`, location: BIGQUERY.location });
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error("introspect ล้มเหลว:", e instanceof Error ? e.message : e);
  process.exit(1);
});
