// sync ปัจจัยแวดล้อม + พยากรณ์สินค้า/สต๊อก:  npm run product-forecast
import "./_env";
import { runEnvSync, runProductForecastSync } from "../src/lib/pipeline";

(async () => {
  await runEnvSync();
  await runProductForecastSync();
})().then(() => { console.log("[product-forecast] เสร็จ"); process.exit(0); })
  .catch((e) => { console.error("[product-forecast] ล้มเหลว:", e instanceof Error ? e.message : e); process.exit(1); });
