// บังคับ sync Customer Retention จาก BigQuery → Supabase:  npm run retention
import "./_env";
import { runRetentionSync } from "../src/lib/pipeline";

runRetentionSync()
  .then(() => { console.log("[retention] เสร็จ"); process.exit(0); })
  .catch((e) => { console.error("[retention] ล้มเหลว:", e instanceof Error ? e.message : e); process.exit(1); });
