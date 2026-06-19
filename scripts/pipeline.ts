// รัน pipeline แบบ one-shot (สำหรับ cron / Render Cron Job / GitHub Action / manual)
//   npm run pipeline
import "./_env";
import { runPipeline } from "../src/lib/pipeline";

runPipeline()
  .then((r) => {
    console.log(
      `[pipeline] เสร็จ: ดึงใหม่ ${r.fetched}, วิเคราะห์ ${r.analyzed}, ` +
        `ในหน้าต่าง ${r.total_in_window} คอมเมนต์ — ทิศทาง ${r.direction} (${r.overall_score}), ` +
        `ด่วน ${r.urgent_total}`
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error("[pipeline] ล้มเหลว:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
