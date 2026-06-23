// เติม shop_id ให้คอมเมนต์เก่าที่ยังไม่มี (จาก BigQuery → Supabase):  npm run backfill-shopid
import "./_env";
import { Client } from "pg";
import { fetchAllShopIds } from "../src/lib/bigquery";

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("ต้องตั้ง SUPABASE_DB_URL ใน .env.local");

  console.log("ดึง comment_id → shop_id จาก BigQuery …");
  const map = await fetchAllShopIds();
  console.log(`ได้ ${map.size} แมป`);

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // เอาเฉพาะ comment_id ที่ยังไม่มี shop_id ใน Supabase
  const { rows } = await client.query<{ comment_id: string }>("select comment_id from public.comments where shop_id is null");
  console.log(`คอมเมนต์ที่ยังไม่มี shop_id: ${rows.length}`);

  let updated = 0, skipped = 0;
  const batch: [string, string][] = [];
  const flush = async () => {
    if (!batch.length) return;
    // UPDATE ... FROM (VALUES ...) — อัปเดตทีละก้อน
    const values = batch.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(",");
    const params = batch.flat();
    await client.query(
      `update public.comments c set shop_id = v.shop_id
       from (values ${values}) as v(comment_id, shop_id)
       where c.comment_id = v.comment_id`,
      params
    );
    updated += batch.length;
    batch.length = 0;
    process.stdout.write(`\r  อัปเดตแล้ว ${updated} …`);
  };

  for (const r of rows) {
    const sid = map.get(r.comment_id);
    if (sid == null) { skipped++; continue; }
    batch.push([r.comment_id, String(sid)]);
    if (batch.length >= 500) await flush();
  }
  await flush();

  await client.end();
  console.log(`\nเสร็จ: อัปเดต ${updated} • ไม่พบใน BigQuery ${skipped}`);
}

main().catch((e) => { console.error("backfill ล้มเหลว:", e instanceof Error ? e.message : e); process.exit(1); });
