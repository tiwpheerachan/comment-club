"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { stockMetrics, type ProductCatalogRow, type StockStatus } from "@/lib/product-analytics";
import { Box, Search } from "./icons";

const LEAD_OPTS = [7, 14, 30, 45];
const STATUS_STYLE: Record<StockStatus, { label: string; cls: string; dot: string }> = {
  urgent: { label: "เสี่ยงของหมด", cls: "text-neg bg-neg-bg", dot: "#ef4444" },
  soon: { label: "ควรเตรียมสั่ง", cls: "text-amber-700 bg-amber-50", dot: "#f59e0b" },
  ok: { label: "ปกติ", cls: "text-pos bg-pos-bg", dot: "#16a34a" },
  overstock: { label: "สต๊อกเกิน", cls: "text-blue-700 bg-blue-50", dot: "#3b82f6" },
  dead: { label: "ค้างสต๊อก", cls: "text-purple-700 bg-purple-50", dot: "#a855f7" },
  nostock: { label: "ไม่มีข้อมูลสต๊อก", cls: "text-muted bg-slate-100", dot: "#94a3b8" },
};
const PLATFORM_LABEL: Record<string, string> = { shopee: "Shopee", tiktok_shop: "TikTok", shopify: "Shopify" };
const num = (n: number | null | undefined) => (n == null ? "-" : Math.round(n).toLocaleString("th-TH"));

export default function StockClient({ products, brands }: { products: ProductCatalogRow[]; brands: string[] }) {
  const [lead, setLead] = useState(14);
  const [brand, setBrand] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const enriched = useMemo(() => products.map((p) => ({ p, m: stockMetrics(p, lead) })), [products, lead]);

  const rows = useMemo(() => {
    let r = enriched;
    if (brand) r = r.filter((x) => x.p.brand === brand);
    if (status) r = r.filter((x) => x.m.status === status);
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((x) => (x.p.name || "").toLowerCase().includes(t) || (x.p.brand || "").toLowerCase().includes(t) || x.p.product_id.includes(t));
    }
    // เรียง: เร่งด่วนก่อน แล้วตามดีมานด์
    const order: Record<StockStatus, number> = { urgent: 0, soon: 1, ok: 2, overstock: 3, dead: 4, nostock: 5 };
    return [...r].sort((a, b) => order[a.m.status] - order[b.m.status] || (b.p.units_90 ?? 0) - (a.p.units_90 ?? 0));
  }, [enriched, brand, status, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { urgent: 0, soon: 0, ok: 0, overstock: 0, dead: 0, nostock: 0 };
    for (const e of enriched) c[e.m.status]++;
    return c;
  }, [enriched]);

  const inp = "border border-line rounded-lg px-2.5 py-2 text-sm bg-white";

  return (
    <div className="px-7 pt-5 pb-16 space-y-5 max-w-[1500px]">
      {/* KPI สรุปสถานะ */}
      <div className="grid grid-cols-6 gap-3 max-[1100px]:grid-cols-3 max-[560px]:grid-cols-2">
        {(["urgent", "soon", "ok", "overstock", "dead", "nostock"] as StockStatus[]).map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? "" : s)}
            className={`card card-pad text-left transition ${status === s ? "ring-2 ring-shopee" : "hover:border-shopee/40"}`}>
            <div className="flex items-center gap-1.5 text-[11.5px] text-muted font-semibold">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_STYLE[s].dot }} />{STATUS_STYLE[s].label}
            </div>
            <div className="text-[24px] font-extrabold text-ink mt-1 leading-none">{counts[s]}</div>
          </button>
        ))}
      </div>

      {/* ตัวกรอง + lead time */}
      <div className="flex items-center gap-2 flex-wrap">
        <select className={inp} value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">ทุกแบรนด์</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={inp} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {(Object.keys(STATUS_STYLE) as StockStatus[]).map((s) => <option key={s} value={s}>{STATUS_STYLE[s].label}</option>)}
        </select>
        <div className="relative flex-1 min-w-[200px] max-w-[340px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className={`${inp} w-full pl-8`} placeholder="ค้นหาสินค้า / แบรนด์ / รหัส" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[11px] text-muted font-semibold">เวลาสั่งของ (วัน)</span>
          <div className="inline-flex rounded-lg border border-line overflow-hidden bg-white">
            {LEAD_OPTS.map((l) => (
              <button key={l} onClick={() => setLead(l)} className={`text-[12px] px-2.5 py-1.5 ${lead === l ? "bg-shopee text-white" : "text-ink hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[12px] text-muted">แสดง {rows.length} สินค้า • วันคงเหลือ (days of cover) = สต๊อก ÷ อัตราขายต่อวัน • จุดสั่งซื้อ/แนะนำสั่ง คำนวณจากเวลาสั่งของ {lead} วัน + เผื่อความปลอดภัย</p>

      {/* ตาราง */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="text-muted text-[11px] uppercase border-b border-line">
                <th className="text-left p-3 font-semibold">สินค้า</th>
                <th className="text-right p-3 font-semibold">ขาย/วัน</th>
                <th className="text-right p-3 font-semibold">สต๊อก</th>
                <th className="text-right p-3 font-semibold">วันคงเหลือ</th>
                <th className="text-left p-3 font-semibold">สถานะ</th>
                <th className="text-right p-3 font-semibold">แนะนำสั่ง</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted">ไม่พบสินค้าตามเงื่อนไข</td></tr>}
              {rows.slice(0, 400).map(({ p, m }) => {
                const st = STATUS_STYLE[m.status];
                return (
                  <tr key={p.product_id} className="border-b border-[#eef0f3] last:border-0 hover:bg-slate-50/40">
                    <td className="p-3 max-w-[420px]">
                      <div className="font-medium text-ink line-clamp-2 text-[13px]">{p.name || p.product_id}</div>
                      <div className="text-muted text-[11px]">{p.brand || "-"} • {PLATFORM_LABEL[p.platform || ""] || p.platform || "-"}</div>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">{m.dailyRate}</td>
                    <td className="p-3 text-right whitespace-nowrap">{num(p.stock)}</td>
                    <td className="p-3 text-right whitespace-nowrap font-semibold" style={{ color: st.dot }}>{m.daysOfCover == null ? "-" : `${m.daysOfCover} วัน`}</td>
                    <td className="p-3"><span className={`text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                    <td className="p-3 text-right whitespace-nowrap font-semibold">{m.recommendedQty > 0 ? "+" + num(m.recommendedQty) : "-"}</td>
                    <td className="p-3 text-right"><Link href={`/stock/${p.product_id}`} className="text-shopee text-xs font-semibold whitespace-nowrap">วิเคราะห์ →</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 400 && <div className="p-3 text-center text-[12px] text-muted">แสดง 400 รายการแรก — ใช้ตัวกรองเพื่อแคบผลลัพธ์</div>}
      </div>
    </div>
  );
}
