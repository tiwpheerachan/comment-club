# Shopee Comment AI — ศูนย์วิเคราะห์คอมเมนต์ (Next.js + Supabase)

ดึงคอมเมนต์จาก **BigQuery** จริง (`elated-channel-468406-t4.Platform.shopee_product_comments`) มาพักที่ **Supabase** (กัน query ซ้ำ ลดค่าใช้จ่าย) วิเคราะห์ด้วย **Claude** แล้วแสดงผลบนเว็บแอป **Next.js** หลายหน้า

> ⚠️ ไม่มีข้อมูลตัวอย่าง/mock — ระบบแสดงเฉพาะข้อมูลจริงจาก BigQuery เท่านั้น ต้องตั้งค่า Supabase + credentials แล้วรัน pipeline ก่อนถึงจะเห็นข้อมูล

### หน้าต่าง ๆ (sidebar)
| หน้า | ทำอะไร |
|---|---|
| **ภาพรวม** | คะแนนทิศทาง -100..+100, เทรนด์รายวัน, สัดส่วนความรู้สึก, สรุปปัญหา, คิวด่วน — กรองรายแบรนด์ได้ |
| **รายแบรนด์** | เทียบทุกแบรนด์ (สัดส่วน, ดาวเฉลี่ย, ด่วน, คะแนน) เรียงแย่สุด→ดีสุด |
| **รายสินค้า** | สินค้าที่ต้องโฟกัส (แย่สุด) + สินค้ารีวิวดีที่สุด |
| **สำรวจคอมเมนต์** | ตารางคอมเมนต์ทั้งหมด ค้นหา/กรอง (แบรนด์/หมวด/ความรู้สึก/สถานะ/ด่วน) + ส่งออก CSV |
| **ศูนย์จัดการด่วน** | คิวด่วนแบบ workflow: รับเรื่อง / มอบหมาย / ปิดงาน |
| **เทรนด์ / รายงาน** | กราฟแนวโน้ม, หมวดปัญหา, เทียบแบรนด์, ส่งออก CSV |
| **ตั้งค่า** | สถานะการเชื่อมต่อ, mapping คอลัมน์, เกณฑ์, ประวัติการรัน, ปุ่มรัน pipeline |

```
BigQuery (raw)
  │  ดึงเฉพาะใหม่ (watermark = created_at ล่าสุดใน Supabase)
  ▼
วิเคราะห์ด้วย Claude  →  upsert ลง Supabase
  ▼
Supabase (comments + snapshots + daily_metrics)  ← dashboard อ่านจากตรงนี้ (ไม่แตะ BigQuery)
  ▼
Next.js Dashboard
```

> BigQuery ถูก query เฉพาะคอมเมนต์ใหม่ในแต่ละรอบเท่านั้น → ลดค่าใช้จ่าย

---

## โครงสร้างไฟล์

```
shopee-comment-ai/
├── sql/                        schema ของ Supabase (รันตามลำดับ 0001→0002→0003)
├── scripts/
│   ├── pipeline.ts             รัน pipeline one-shot (cron) — npm run pipeline
│   └── introspect.ts           ดู schema จริง + ตัวอย่าง — npm run introspect
├── src/
│   ├── lib/
│   │   ├── config.ts           ตั้งค่าหลัก (column mapping, เกณฑ์ด่วน, หมวด, AI)
│   │   ├── bigquery.ts         ดึงเฉพาะคอมเมนต์ใหม่ (incremental, auto-detect service-account.json)
│   │   ├── analyzer.ts         วิเคราะห์ด้วย Claude + fallback rule-based + override กฎด่วน
│   │   ├── aggregate.ts        สรุปภาพรวม/รายแบรนด์/คิวด่วน
│   │   ├── pipeline.ts         รวมขั้นตอน ดึง→วิเคราะห์→upsert→snapshot
│   │   ├── db.ts               query Supabase (products/brands/comments/triage/runs)
│   │   ├── supabase.ts, store.ts, parseFilters.ts, types.ts, ui.ts
│   ├── app/
│   │   ├── page.tsx            ภาพรวม
│   │   ├── brands | products | explore | triage | trends | settings
│   │   ├── api/                summary, trend, comments, triage, export, pipeline
│   │   └── layout.tsx (sidebar), globals.css
│   └── components/             Sidebar, Dashboard, charts (recharts), Explore/Triage clients, icons
└── legacy-python/              เวอร์ชัน FastAPI เดิม (เก็บไว้อ้างอิง ไม่ได้ใช้แล้ว)
```

---

## ตั้งค่า (จำเป็น — ไม่มีโหมดตัวอย่าง)

```bash
npm install
```

### 1) สร้าง Supabase + รัน schema (3 ไฟล์ ตามลำดับ)
- สร้าง project บน https://supabase.com
- เปิด **SQL Editor → New query** วางทีละไฟล์แล้วกด Run: `sql/0001_init.sql` → `sql/0002_triage.sql` → `sql/0003_views.sql`
- คัดลอก `Project URL` + `service_role key` จาก **Project Settings → API**

### 2) วาง BigQuery credentials
วางไฟล์ service account key ชื่อ **`service-account.json`** ไว้ที่รากโปรเจกต์ (ระบบ auto-detect ให้ — gitignore ไว้แล้ว)
หรือจะตั้ง `GOOGLE_APPLICATION_CREDENTIALS` ใน `.env.local` ก็ได้
> service account ต้องมีสิทธิ์ **BigQuery Data Viewer + Job User**

### 3) ตั้งค่า env
คัดลอก `.env.example` เป็น `.env.local` แล้วกรอก `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`

### 4) ตรวจ + ยืนยัน column mapping จาก schema จริง
```bash
npm run introspect   # พิมพ์ชื่อคอลัมน์จริง + ตัวอย่างข้อมูลจาก BigQuery
```
ถ้าชื่อคอลัมน์ไม่ตรง แก้ `COLUMNS` ใน `src/lib/config.ts` ให้ตรง (โดยเฉพาะ `comment_id`, `brand`, `comment_text`, `created_at`)

### 5) รัน pipeline ครั้งแรก (backfill) แล้วเปิดเว็บ
```bash
npm run pipeline   # ดึง+วิเคราะห์+เขียนลง Supabase
npm run dev        # เปิด http://localhost:3000
```
> หรือกดปุ่ม "ดึง+วิเคราะห์จาก BigQuery เดี๋ยวนี้" ในหน้า **ตั้งค่า**

---

## ตั้งรันอัตโนมัติทุกวัน

pipeline เป็น **endpoint/สคริปต์เดียว** ใช้ trigger ได้หลายวิธี:

| วิธี | how |
|---|---|
| **Render Cron Job** | สร้าง Cron Job ชี้คำสั่ง `npm run pipeline` (หรือ `curl -H "Authorization: Bearer $PIPELINE_SECRET" https://<app>/api/pipeline`) ตั้ง schedule `0 7 * * *` |
| **GitHub Action** | workflow `schedule: cron` ยิง `curl` ไปที่ `/api/pipeline` พร้อม secret |
| **cron บนเครื่อง** | `0 7 * * * cd /path && npm run pipeline >> cron.log 2>&1` |
| **ปุ่มบน dashboard** | กด "ดึง+วิเคราะห์ใหม่" (same-origin ไม่ต้องใช้ secret) |

> ตั้ง `PIPELINE_SECRET` ใน env ตอน deploy เพื่อกันคนนอกยิง `/api/pipeline`

---

## Deploy ขึ้น Render (มี `render.yaml` ให้แล้ว)

> Supabase เป็น cloud อยู่แล้ว — Render แค่เสิร์ฟเว็บ + ตั้ง cron ดึงเพิ่มรายวัน (incremental) ไม่ต้อง migrate/backfill ใหม่

### 1) push ขึ้น GitHub
```bash
git init && git add -A && git commit -m "shopee comment ai"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
> `.env.local` และ `service-account.json` ถูก gitignore ไว้แล้ว (ไม่หลุดขึ้น repo)

### 2) สร้างบน Render
- Render Dashboard → **New → Blueprint** → เลือก repo → Render อ่าน `render.yaml` สร้างให้ 2 ตัว: **web** + **cron**
- กรอก env ที่เป็น `sync:false`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (เว้นว่างได้)

### 3) ใส่ BigQuery credentials เป็น Secret File (สำคัญ)
ทั้ง service **web** และ **cron** → tab **Environment → Secret Files → Add Secret File**
- Filename: `service-account.json` → วางเนื้อหา JSON ทั้งไฟล์
- Render mount ที่ `/etc/secrets/service-account.json` ตรงกับ `GOOGLE_APPLICATION_CREDENTIALS` ใน `render.yaml`

### 4) Deploy → เปิดเว็บ
- ได้ URL `https://<app>.onrender.com` (ข้อมูลขึ้นทันทีเพราะ Supabase มีข้อมูลอยู่แล้ว)
- cron จะดึงเพิ่มอัตโนมัติทุกวัน 07:00 (เวลาไทย)

> **Cron ฟรี:** ถ้าไม่อยากใช้ Render Cron (paid) ใช้ **GitHub Action** ยิง `curl -X POST -H "Authorization: Bearer <PIPELINE_SECRET>" https://<app>.onrender.com/api/pipeline` แทนได้
> **Free web service** จะ sleep หลังไม่มีคนเข้า (cold start ช้า) — ถ้าต้องการ always-on ใช้ plan **Starter**

---

## ปรับแต่ง (`src/lib/config.ts` หรือ env)

- `URGENT_RULES.rating_threshold` / `severity_threshold` / `red_flag_keywords` — เกณฑ์ด่วน (บังคับทับผล AI เสมอ)
- `AI.enabled=false` — ใช้ rule-based อย่างเดียว (ฟรี ไม่เรียก AI)
- `AI.batchSize` (10) / `AI.maxTokens` (8192) — คุม token ต่อ request
- `PIPELINE.windowDays` (30) — หน้าต่างเวลาที่ dashboard สรุป
- `PIPELINE.maxPerRun` (0=ไม่จำกัด) — จำกัดจำนวนต่อรอบ

---

## API

| Endpoint | คำอธิบาย |
|---|---|
| `GET /api/summary` | สรุปภาพรวม + รายแบรนด์ + คิวด่วน (จาก snapshot ล่าสุด) |
| `GET /api/trend` | คะแนนทิศทางย้อนหลัง (สูงสุด 90 วัน) |
| `GET /api/comments` | คอมเมนต์แบบกรอง/แบ่งหน้า (brand, product, sentiment, category, status, q, urgent, sort, page) |
| `PATCH /api/triage` | อัปเดตสถานะคอมเมนต์ด่วน (new/in_progress/resolved, assignee, note) |
| `GET /api/export` | ส่งออกคอมเมนต์ที่กรองเป็น CSV |
| `POST/GET /api/pipeline` | สั่งดึง+วิเคราะห์ใหม่ (ต้องมี secret ถ้าตั้งไว้) |
```
