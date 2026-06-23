"use client";
import { useCallback, useEffect, useState } from "react";
import type { CommentRow } from "@/lib/db";
import { sevColors } from "@/lib/ui";
import { SentChip, ShopeeLink } from "./common";
import { Download, Search, Star } from "./icons";
import ImageThumbs from "./ImageThumbs";
import ReplyBox from "./ReplyBox";

interface Filters {
  brand: string;
  product: string;
  sentiment: string;
  category: string;
  status: string;
  q: string;
  urgentOnly: boolean;
  sort: string;
}

const PAGE_SIZE = 50;

export default function ExploreClient({
  brands,
  categories,
  initial,
}: {
  brands: string[];
  categories: string[];
  initial: { brand?: string; product?: string };
}) {
  const [f, setF] = useState<Filters>({
    brand: initial.brand ?? "",
    product: initial.product ?? "",
    sentiment: "",
    category: "",
    status: "",
    q: "",
    urgentOnly: false,
    sort: "created_desc",
  });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const buildQuery = useCallback(
    (p: number) => {
      const q = new URLSearchParams();
      if (f.brand) q.set("brand", f.brand);
      if (f.product) q.set("product", f.product);
      if (f.sentiment) q.set("sentiment", f.sentiment);
      if (f.category) q.set("category", f.category);
      if (f.status) q.set("status", f.status);
      if (f.q) q.set("q", f.q);
      if (f.urgentOnly) q.set("urgent", "1");
      q.set("sort", f.sort);
      q.set("page", String(p));
      q.set("pageSize", String(PAGE_SIZE));
      return q;
    },
    [f]
  );

  const fetchData = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await fetch("/api/comments?" + buildQuery(p).toString());
        const json = await res.json();
        setRows(json.rows ?? []);
        setTotal(json.total ?? 0);
      } catch {
        setRows([]);
        setTotal(0);
      }
      setLoading(false);
    },
    [buildQuery]
  );

  // ดึงใหม่เมื่อฟิลเตอร์เปลี่ยน (debounce สำหรับช่องค้นหา)
  useEffect(() => {
    setPage(1);
    const t = setTimeout(() => fetchData(1), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const set = (k: keyof Filters, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  const inputCls = "bg-white border border-line px-2.5 py-1.5 rounded-lg text-[13px]";

  return (
    <div className="p-7">
      {/* filters */}
      <div className="card card-pad mb-4">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className={inputCls + " pl-8 w-[230px]"}
              placeholder="ค้นหาข้อความ…"
              value={f.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </div>
          <select className={inputCls} value={f.brand} onChange={(e) => set("brand", e.target.value)}>
            <option value="">ทุกแบรนด์</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select className={inputCls} value={f.sentiment} onChange={(e) => set("sentiment", e.target.value)}>
            <option value="">ทุกความรู้สึก</option>
            <option value="positive">บวก</option>
            <option value="neutral">กลาง</option>
            <option value="negative">ลบ</option>
          </select>
          <select className={inputCls} value={f.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">ทุกหมวด</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className={inputCls} value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option value="new">ยังไม่จัดการ</option>
            <option value="in_progress">กำลังจัดการ</option>
            <option value="resolved">จัดการแล้ว</option>
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-ink cursor-pointer">
            <input type="checkbox" checked={f.urgentOnly} onChange={(e) => set("urgentOnly", e.target.checked)} />
            เฉพาะด่วน
          </label>
          <select className={inputCls} value={f.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="created_desc">ใหม่→เก่า</option>
            <option value="created_asc">เก่า→ใหม่</option>
            <option value="severity_desc">รุนแรงสุด</option>
            <option value="rating_asc">ดาวน้อยสุด</option>
          </select>
          <a
            href={"/api/export?" + buildQuery(1).toString()}
            className="inline-flex items-center gap-1.5 bg-white border border-line px-3 py-1.5 rounded-lg text-[13px] font-semibold hover:bg-gray-50 ml-auto"
          >
            <Download className="w-4 h-4" /> ส่งออก CSV
          </a>
        </div>
      </div>

      {/* table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="text-left p-3 font-semibold whitespace-nowrap">วันที่</th>
              <th className="text-left p-3 font-semibold">แบรนด์ / สินค้า</th>
              <th className="text-left p-3 font-semibold">ดาว</th>
              <th className="text-left p-3 font-semibold">ความรู้สึก</th>
              <th className="text-left p-3 font-semibold">รุนแรง</th>
              <th className="text-left p-3 font-semibold">คอมเมนต์</th>
              <th className="text-left p-3 font-semibold">หมวด</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-muted">
                  กำลังโหลด…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-10 text-center text-muted">
                  ไม่พบคอมเมนต์ตามเงื่อนไข
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const [bg, fg] = sevColors(r.severity ?? 0);
                return (
                  <tr key={r.comment_id} className="border-b border-[#eef0f3] last:border-0 align-top">
                    <td className="p-3 text-muted text-xs whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString("th-TH") : "-"}
                    </td>
                    <td className="p-3">
                      {r.brand || "-"}
                      <div className="text-muted text-[11.5px]">{r.product_name || ""}</div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {r.rating ?? "-"} <Star className="w-3 h-3 inline text-neu" />
                    </td>
                    <td className="p-3">
                      <SentChip s={r.sentiment} />
                    </td>
                    <td className="p-3">
                      <span
                        className="inline-flex items-center justify-center min-w-[26px] font-bold px-1.5 py-0.5 rounded text-xs"
                        style={{ background: bg, color: fg }}
                      >
                        {r.severity ?? 0}
                      </span>
                    </td>
                    <td className="p-3 max-w-[460px]">
                      <div className="text-[13.5px]">{r.comment_text}</div>
                      <ImageThumbs images={r.images} size={44} max={5} />
                      {r.suggested_action && (
                        <div className="text-[12px] text-shopee mt-1">→ {r.suggested_action}</div>
                      )}
                      {r.note && (
                        <div className="text-[12px] mt-1.5 p-1.5 rounded-lg bg-pos-bg/60 border border-pos/20 text-ink">
                          ตอบแล้ว{r.assignee ? ` โดย ${r.assignee}` : ""}: {r.note}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <ShopeeLink shopId={r.shop_id} itemId={r.product_name} />
                      </div>
                      <ReplyBox comment={r} onSent={() => fetchData(page)} />
                    </td>
                    <td className="p-3">
                      <span className="chip">{r.category || "-"}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-between mt-3.5 text-sm">
        <div className="text-muted">
          ทั้งหมด {total.toLocaleString("th-TH")} คอมเมนต์ • หน้า {page}/{totalPages}
        </div>
        <div className="flex gap-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              fetchData(p);
            }}
            className="px-3 py-1.5 rounded-lg border border-line bg-white disabled:opacity-50"
          >
            ก่อนหน้า
          </button>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              fetchData(p);
            }}
            className="px-3 py-1.5 rounded-lg border border-line bg-white disabled:opacity-50"
          >
            ถัดไป
          </button>
        </div>
      </div>
    </div>
  );
}
