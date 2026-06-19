"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProductStat } from "@/lib/db";
import { dirBg, dirColor, fmtScore } from "@/lib/ui";
import { SentimentBar } from "./common";
import { Box, Search, Star } from "./icons";

type SortKey = "worst" | "best" | "most" | "urgent";
const SORTS: { key: SortKey; label: string }[] = [
 { key: "worst", label: "คะแนนแย่สุด" },
 { key: "best", label: "คะแนนดีสุด" },
 { key: "most", label: "รีวิวเยอะสุด" },
 { key: "urgent", label: "ด่วนเยอะสุด" },
];

type ScoreFilter = "all" | "neg" | "watch" | "good";

export default function ProductsGrid({ products }: { products: ProductStat[] }) {
 const [sort, setSort] = useState<SortKey>("worst");
 const [q, setQ] = useState("");
 const [brand, setBrand] = useState("");
 const [scoreF, setScoreF] = useState<ScoreFilter>("all");
 const [urgentOnly, setUrgentOnly] = useState(false);

 const brands = useMemo(
 () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean) as string[])).sort(),
 [products]
 );

 const rows = useMemo(() => {
 let r = products;
 if (q.trim()) {
 const t = q.toLowerCase();
 r = r.filter(
 (p) => (p.item_name || p.product_name).toLowerCase().includes(t) || (p.brand || "").toLowerCase().includes(t)
 );
 }
 if (brand) r = r.filter((p) => p.brand === brand);
 if (urgentOnly) r = r.filter((p) => p.urgent_count > 0);
 if (scoreF === "neg") r = r.filter((p) => p.sentiment_score < 0);
 else if (scoreF === "watch") r = r.filter((p) => p.sentiment_score < 15);
 else if (scoreF === "good") r = r.filter((p) => p.sentiment_score >= 40);

 const s = [...r];
 if (sort === "worst") s.sort((a, b) => a.sentiment_score - b.sentiment_score);
 else if (sort === "best") s.sort((a, b) => b.sentiment_score - a.sentiment_score);
 else if (sort === "most") s.sort((a, b) => b.total - a.total);
 else s.sort((a, b) => b.urgent_count - a.urgent_count || a.sentiment_score - b.sentiment_score);
 return s;
 }, [products, sort, q, brand, scoreF, urgentOnly]);

 const sel = "bg-white border border-line px-2.5 py-1.5 rounded-lg text-[13px]";

 return (
 <div className="px-7 pt-5 pb-16 max-w-[1320px]">
 {/* smart filters */}
 <div className="flex items-center gap-2.5 flex-wrap mb-3">
 <div className="flex gap-1.5">
 {SORTS.map((s) => (
 <button
 key={s.key}
 onClick={() => setSort(s.key)}
 className={`px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
 sort === s.key ? "bg-shopee text-white border-shopee" : "bg-white border-line text-ink hover:bg-slate-50"
 }`}
 >
 {s.label}
 </button>
 ))}
 </div>
 <select className={sel} value={brand} onChange={(e) => setBrand(e.target.value)}>
 <option value="">ทุกแบรนด์</option>
 {brands.map((b) => (
 <option key={b}>{b}</option>
 ))}
 </select>
 <select className={sel} value={scoreF} onChange={(e) => setScoreF(e.target.value as ScoreFilter)}>
 <option value="all">ทุกคะแนน</option>
 <option value="neg">คะแนนติดลบ</option>
 <option value="watch">เฝ้าระวัง (&lt;15)</option>
 <option value="good">ดีมาก (≥40)</option>
 </select>
 <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
 <input type="checkbox" checked={urgentOnly} onChange={(e) => setUrgentOnly(e.target.checked)} /> เฉพาะมีด่วน
 </label>
 <div className="relative ml-auto">
 <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
 <input
 value={q}
 onChange={(e) => setQ(e.target.value)}
 placeholder="ค้นหาชื่อสินค้า / แบรนด์…"
 className="bg-white border border-line pl-8 pr-3 py-2 rounded-lg text-[13px] w-[240px]"
 />
 </div>
 </div>

 <div className="text-muted text-[13px] mb-2">แสดง {rows.length.toLocaleString("th-TH")} สินค้า</div>

 {/* compact list */}
 <div className="card overflow-hidden divide-y divide-[#eef0f3]">
 {rows.map((p) => {
 const name = p.item_name || `สินค้า #${p.product_name}`;
 return (
 <Link
 key={p.product_name}
 href={`/products/${encodeURIComponent(p.product_name)}`}
 className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 transition-colors"
 >
 {/* thumb */}
 <div className="w-11 h-11 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center flex-none border border-line">
 {p.thumbnail_url || p.image_url ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={(p.thumbnail_url || p.image_url) as string} alt="" loading="lazy" className="w-full h-full object-cover" />
 ) : (
 <Box className="w-5 h-5 text-slate-300" />
 )}
 </div>

 {/* name + brand */}
 <div className="min-w-0 flex-1">
 <div className="text-[13.5px] font-medium leading-tight line-clamp-1">{name}</div>
 <div className="text-[11.5px] text-muted mt-0.5 flex items-center gap-1.5">
 <span>{p.brand || "-"}</span>
 {p.price != null && <span className="text-shopee font-semibold">฿{Number(p.price).toLocaleString("th-TH")}</span>}
 </div>
 </div>

 {/* rating */}
 <div className="hidden md:flex items-center gap-1 text-[12.5px] text-muted w-[64px] flex-none">
 <Star className="w-[13px] h-[13px] text-neu" /> {p.avg_rating ?? "-"}
 </div>
 {/* comments */}
 <div className="hidden sm:block text-[12.5px] text-muted w-[80px] flex-none text-right">{p.total} รีวิว</div>
 {/* sentiment bar */}
 <div className="hidden lg:block w-[120px] flex-none">
 <SentimentBar positive={p.positive} neutral={p.neutral} negative={p.negative} />
 </div>
 {/* urgent */}
 <div className="w-[44px] flex-none text-right">
 {p.urgent_count > 0 ? (
 <span className="text-[11px] text-neg font-semibold">{p.urgent_count}</span>
 ) : (
 <span className="text-[11px] text-muted/50">—</span>
 )}
 </div>
 {/* score */}
 <span
 className="pill w-[52px] justify-center flex-none"
 style={{ background: dirBg(p.sentiment_score), color: dirColor(p.sentiment_score) }}
 >
 {fmtScore(p.sentiment_score)}
 </span>
 </Link>
 );
 })}
 {rows.length === 0 && <div className="p-10 text-center text-muted text-sm">ไม่พบสินค้าตามเงื่อนไข</div>}
 </div>
 </div>
 );
}
