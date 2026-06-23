// เติม "คำตอบจากผู้ขาย" ให้คอมเมนต์เก่า (จาก BigQuery → Supabase):  npm run backfill-seller-reply
import "./_env";
import { Client } from "pg";
import { fetchAllSellerReplies } from "../src/lib/bigquery";
import { clean } from "../src/lib/text";

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("ต้องตั้ง SUPABASE_DB_URL ใน .env.local");

  console.log("ดึงคำตอบผู้ขายจาก BigQuery …");
  const map = await fetchAllSellerReplies();
  console.log(`มีคำตอบผู้ขาย ${map.size} คอมเมนต์`);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // เอาเฉพาะ comment_id ที่มีอยู่ใน Supabase และยังไม่มี seller_reply
  const { rows } = await client.query<{ comment_id: string }>("select comment_id from public.comments where seller_reply is null");
  console.log(`คอมเมนต์ใน Supabase ที่ยังไม่มี seller_reply: ${rows.length}`);

  let updated = 0;
  let batch: [string, string, string | null, boolean][] = [];
  const flush = async () => {
    if (!batch.length) return;
    const values = batch.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}::timestamptz, $${i * 4 + 4}::boolean)`).join(",");
    const params = batch.flat();
    await client.query(
      `update public.comments c
       set seller_reply = v.reply, seller_reply_at = v.at, seller_reply_hidden = v.hidden
       from (values ${values}) as v(comment_id, reply, at, hidden)
       where c.comment_id = v.comment_id`,
      params
    );
    updated += batch.length;
    batch = [];
    process.stdout.write(`\r  อัปเดตแล้ว ${updated} …`);
  };

  for (const r of rows) {
    const sr = map.get(r.comment_id);
    if (!sr) continue;
    batch.push([r.comment_id, clean(sr.reply) || sr.reply, sr.at, sr.hidden]);
    if (batch.length >= 500) await flush();
  }
  await flush();

  await client.end();
  console.log(`\nเสร็จ: อัปเดต ${updated} คอมเมนต์ที่มีคำตอบผู้ขาย`);
}

main().catch((e) => { console.error("backfill ล้มเหลว:", e instanceof Error ? e.message : e); process.exit(1); });
