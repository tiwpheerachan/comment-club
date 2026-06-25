# แนวทางพยากรณ์ยอดขาย & สต๊อกให้แม่นที่สุด — สรุปจากงานวิจัย

> บทความสั้นสำหรับทีม Shopee Comment AI • ทุกข้อมีอ้างอิง (แหล่ง, ปี, URL) • ผ่านการ fact-check แบบ adversarial
> เครื่องหมาย ✅ = ระบบเราทำแล้ว • 🔜 = ควรทำต่อ

---

## 1. ปัจจัยที่ "ควรใช้" พยากรณ์ (เรียงตามพลังที่งานวิจัยยืนยัน)

| ปัจจัย | หลักฐาน | สถานะเรา |
|---|---|---|
| **ราคา / ส่วนลด / โปรโมชั่น** | ปัจจัยดิบที่สำคัญที่สุดใน **M5 (Walmart)**; ความยืดหยุ่นราคาช่วงโปรเฉลี่ย ≈ **−3.35** (แรงกว่าราคาปกติ ≈ −1.45) | ✅ `price-elasticity.ts` |
| **ปฏิทิน/ฤดูกาล (วันหยุด, เงินเดือนออก, วันในสัปดาห์)** | กลุ่มฟีเจอร์ที่ให้ผลต่อความแม่น "มากที่สุด" ใน M5; วันจ่ายเงินเดือน (SNAP) เป็นตัวแปรพยากรณ์โดยตรง | ✅ บางส่วน (weekly + แคมเปญ) 🔜 วันหยุดไทย |
| **Search interest (Google Trends)** | ลด MAE การพยากรณ์ยอดค้าปลีก ~10.5% (สูงสุด ~21.5% ช่วงวิกฤต); นำยอดขาย **4–6 สัปดาห์** | 🔜 |
| **สต๊อกหมด (censored demand)** | ละเลย stockout → ประเมินดีมานด์ต่ำไป ~**7.4%**; แก้แล้วลด error ~2.7% WAPE | ✅ `stock-risk.ts` |
| **รีวิว / เรตติ้ง / sentiment** | ทำนายยอดขายออนไลน์ได้ (Amazon, neural net) | ✅ `sentiment-signal.ts` |
| **โฆษณา / ad spend** | ผลจริงแต่เล็ก: elasticity สั้น ≈ 0.12, ยาว ≈ 0.24 | — (ไม่มี data) |
| **วงจรชีวิตสินค้า / สินค้าใหม่** | Bass diffusion พยากรณ์สินค้าใหม่ได้โดยไม่ต้องมีประวัติ | ✅ lifecycle 🔜 Bass |

**สรุป:** ปฏิทิน+ราคา/โปรคือ 2 ปัจจัยที่ให้ความแม่นระดับ SKU แน่นอนสุด • Google Trends คือสัญญาณภายนอกที่แรงสุด • การแก้ stockout แก้ที่ "อคติ (bias)"

อ้างอิง: Bijmolt et al., *J. Marketing Research* 2005 · Makridakis et al. "M5 accuracy," *Int. J. Forecasting* 2022 (https://www.sciencedirect.com/science/article/pii/S0169207021001874) · Choi & Varian, *The Economic Record* 2012 · Boone et al., *POM* 2018 · Wang et al. "FreshRetailNet-50K," arXiv 2025 · Chong et al., *IJOPM* 2016 · Sethuraman et al., *JMR* 2011 · Bass 1969.

---

## 2. วิธีพยากรณ์ — บทเรียนจากการแข่งขัน M4 / M5

- **M4 (100,000 อนุกรม):** ชนะโดย **hybrid ES-RNN** (exponential smoothing + LSTM) แม่นกว่า benchmark ~10%; อันดับ 2 **FFORMA** (ensemble แบบ gradient boosting). **ML ล้วนแพ้หมด** — "การผสมโมเดล (ensemble) คือทางรอด" (Makridakis et al., *IJF* 2020).
- **M5 (Walmart, ~42,840 อนุกรมรายวัน):** ครั้งแรกที่ **ML ครองตำแหน่ง — LightGBM ชนะ** ทุก benchmark สถิติ โดยเฉพาะเมื่อมี **ตัวแปรราคา/โปร/ปฏิทิน** (Makridakis et al., *IJF* 2022).
- **เลือกโมเดลยังไง:** ETS/Holt-Winters สำหรับอนุกรมเรียบมีฤดูกาล · ARIMA/SARIMAX เมื่อมี autocorrelation/ตัวแปรภายนอก · **LightGBM global model** เมื่อมี SKU จำนวนมากที่สัมพันธ์กัน (สถาปัตยกรรมที่ชนะ M5) · DeepAR เมื่อต้องการ probabilistic + สินค้าใหม่ · **Prophet ใช้ง่ายแต่มักแพย้ ETS** (M3: แย่กว่า ~26–44%).

> **เราทำอยู่:** ✅ auto model-selection (Moving-Avg / Linear×Seasonal / Holt-Winters / Croston / TSB) เลือกด้วย backtest WAPE ต่อสินค้า — สอดคล้องหลัก "เลือกโมเดลตามข้อมูล + ผสม"
> 🔜 ถัดไป: LightGBM global model ข้าม SKU (ต้องมี data pipeline/Python service)

อ้างอิง: Makridakis et al. *IJF* 2020 (M4), 2022 (M5) · Salinas et al. "DeepAR," *IJF* 2020 · Taylor & Letham "Prophet" 2018 · Kourentzes 2017 · Hyndman & Athanasopoulos *FPP3* §9.10.

---

## 3. สินค้าขายเป็นช่วง (Intermittent) — จำแนกก่อน เลือกโมเดลทีหลัง

- **จำแนกด้วย ADI & CV²** (เกณฑ์ **1.32 / 0.49**): Smooth / Erratic / Intermittent / Lumpy (Syntetos, Boylan & Croston 2005). ✅ เราทำใน `demandPattern()`
- **Croston** แยกประมาณ "ขนาดดีมานด์" กับ "ช่วงห่าง" — แต่ **เอนเอียงสูงไป (over-forecast)** ✅ มี
- **SBA (Syntetos-Boylan Approximation):** คูณ Croston ด้วย **(1 − α/2)** แก้อคติ — **หลักฐานแน่นสุด เป็นตัวเลือกตั้งต้นเมื่อ ADI สูง** ✅ **เพิ่มแล้ว** (`forecast-models.ts`)
- **TSB:** อัปเดต "ความน่าจะเป็นที่จะขาย" ทุกวัน เหมาะสินค้าใกล้ตกรุ่น ✅ มี

อ้างอิง: Syntetos & Boylan, *IJF* 2005 · Croston 1972 · Teunter et al., *EJOR* 2011.

---

## 4. ตัววัดความแม่น — เลิกใช้ MAPE กับสินค้าขายไม่สม่ำเสมอ

- **MAPE พังกับดีมานด์ที่มี 0** (หารด้วย 0 ไม่ได้/ระเบิด) และ **เอนเอียง → ทำให้เลือกโมเดลที่พยากรณ์ "ต่ำไป"**
- ใช้แทนด้วย: **MASE** (scale-free, ใช้กับ 0 ได้), **RMSSE** (M5 ใช้ WRMSSE), **WAPE** (ถ่วงน้ำหนักด้วยปริมาณ)
- ชั้น probabilistic ใช้ **Pinball/quantile loss**

> **เราทำอยู่:** ✅ สินค้าขายเป็นช่วงวัดด้วย **WAPE รายสัปดาห์** (ไม่ใช่ MAPE รายวัน) แล้ว • 🔜 เพิ่ม **MASE** เป็นตัววัดมาตรฐาน

อ้างอิง: Hyndman & Koehler, *IJF* 2006 · *FPP3* §5.8.

---

## 5. สต๊อก: สั่งเท่าไหร่ให้คุ้มที่สุด (Newsvendor)

- **จุดสั่งที่เหมาะ = quantile ของดีมานด์ ไม่ใช่ค่าเฉลี่ย** — ตั้งที่ **critical ratio CR = Cu/(Cu+Co)** (Cu=ต้นทุนของขาด, Co=ต้นทุนของเกิน) → Q* = μ + z*·σ
- **Service level (โอกาสไม่ขาดสต๊อก) ≠ Fill rate (สัดส่วนดีมานด์ที่จ่ายได้)** — ต่างกัน ควรระบุให้ชัด
- **Safety stock ที่ถูกต้องต้องรวมความผันผวนของ lead time ด้วย:**
  `SS = z·√(LT·σ_d² + d²·σ_LT²)` , `reorder point = d·LT + SS`

> **เราทำอยู่:** ✅ safety stock ตาม service level (z×σ_d×√LT) • 🔜 เพิ่มเทอม `d²·σ_LT²` (ความผันผวนเวลาสั่งของ) + คิดแบบ critical-fractile/quantile

อ้างอิง: Cachon & Terwiesch 2006 · MIT (King; Caplice OCW lect.11) · *FPP3* §5.9 · Lokad quantile 2012.

---

## 6. ปฏิทินไทย — แก้ข้อสมมติที่ผิด

- **Double-date ไตรมาส 4 (9.9/10.10/11.11/12.12) คือพีคหลัก** — 11.11 ใหญ่สุดในไทย, แพลตฟอร์มจัดเลขเบิ้ลทุกเดือน
- **เงินเดือนออกไม่ใช่ "วันที่ 25" เสมอ** — กฎหมายไทยกำหนดแค่จ่ายรายเดือนตามวันในสัญญา ค่าปริยายที่พบบ่อยคือ **วันทำการสุดท้ายของเดือน** → ระบบควรทำให้ตั้งค่าได้ ไม่ฮาร์ดโค้ด 25
- **Songkran (13–15 เม.ย.)** และ **ตรุษจีน** เป็นเทศกาลใช้จ่ายใหญ่ (Songkran เอนไปทางท่องเที่ยว/ออฟไลน์)

> **เราทำอยู่:** ✅ ปฏิทินแคมเปญ double-date + uplift forecaster • ✅ **แก้ payday เป็น "วันทำการสุดท้ายของเดือน"** แล้ว • 🔜 เพิ่ม Songkran/ตรุษจีน/ปีใหม่เป็น flag

อ้างอิง: SellerCraft/SmartOSC 2025 · Momentum Works 2024 · Rivermate (Thailand salary) 2025 · Thai PBS 2026.

---

## 7. Roadmap จัดลำดับตาม impact/effort

**Tier 1 — ผลสูง แรงน้อย (ทำก่อน)**
1. 🔜 เพิ่ม **ปฏิทินวันหยุดไทย** (Songkran/ตรุษจีน/ปีใหม่ + payday วันทำการสุดท้าย) เป็นตัวแปรพยากรณ์
2. ✅ เลิก MAPE → ใช้ WAPE/MASE/RMSSE (ทำแล้วบางส่วน — เพิ่ม MASE)
3. ✅ จำแนก SKU ด้วย ADI/CV² → route SBA(ADI สูง)/TSB(ตกรุ่น)/ETS(เรียบ) — **ทำแล้ว**

**Tier 2 — ผลสูง แรงปานกลาง**
4. ✅ ฟีเจอร์ราคา/ส่วนลด/โปร — **ทำแล้ว** (`price-elasticity.ts`)
5. 🔜 **LightGBM global model** ข้าม SKU (Nixtla MLForecast) — สถาปัตยกรรมที่ชนะ M5
6. ✅ แก้ stockout censoring — **ทำแล้ว** (`stock-risk.ts`)

**Tier 3 — สร้างความต่าง แรงสูง**
7. 🔜 **Probabilistic forecast (quantile/pinball) → safety stock โดยตรง** ที่ critical fractile
8. 🔜 **Hierarchical reconciliation (MinT)** ให้ SKU→หมวด→รวมร้าน สอดคล้องกัน
9. 🔜 **Google Trends / search interest** เป็นสัญญาณนำ (นำ 4–6 สัปดาห์)
10. 🔜 **Bass model** สำหรับสินค้าใหม่ที่ยังไม่มีประวัติ

---

### หมายเหตุความน่าเชื่อถือ
- ตัวเลข GMV/uplift ของแพลตฟอร์มไทยส่วนใหญ่เป็น **ตัวเลขที่แพลตฟอร์มแถลงเอง** (ความเชื่อมั่นปานกลาง); ส่วนแบ่งตลาดจาก Momentum Works เป็นบุคคลที่สาม (เชื่อมั่นสูง)
- "เงินเดือนออกวันที่ 25" **ไม่ยืนยัน** — ใช้วันทำการสุดท้ายของเดือนเป็นค่าตั้งต้นและทำให้ตั้งค่าได้
