// โหลด env ให้สคริปต์ tsx — อ่าน .env.local ก่อน แล้วตามด้วย .env (เหมือนที่ Next.js ทำ)
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
