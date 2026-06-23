// บังคับ sync ยอดขายรายวัน (Forecasting) จาก BigQuery → Supabase:  npm run gmv
import "./_env";
import { runGmvSync } from "../src/lib/pipeline";

runGmvSync()
  .then(() => { console.log("[gmv] เสร็จ"); process.exit(0); })
  .catch((e) => { console.error("[gmv] ล้มเหลว:", e instanceof Error ? e.message : e); process.exit(1); });
