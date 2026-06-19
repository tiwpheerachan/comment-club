// รัน SQL migration ทั้งหมดใน sql/ ตามลำดับ ผ่าน Postgres connection ของ Supabase
//   npm run migrate
import "./_env";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("ต้องตั้ง SUPABASE_DB_URL ใน .env.local");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("เชื่อม Postgres สำเร็จ");

  const dir = resolve(process.cwd(), "sql");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(resolve(dir, f), "utf-8");
    process.stdout.write(`รัน ${f} … `);
    await client.query(sql);
    console.log("✓");
  }

  await client.end();
  console.log("migration เสร็จทั้งหมด");
}

main().catch((e) => {
  console.error("migration ล้มเหลว:", e instanceof Error ? e.message : e);
  process.exit(1);
});
