import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ProductReviews from "@/components/ProductReviews";
import { ScorePill, SentimentBar } from "@/components/common";
import { Box, Star } from "@/components/icons";
import { directionLabel } from "@/lib/aggregate";
import { getProductStat, getSimilarProducts, listComments } from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";
import { dirBg, dirColor, fmtScore } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ProductProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = decodeURIComponent(id);

  if (!hasSupabase()) {
    return (<><PageHeader title="สินค้า" /><div className="p-7 text-muted">ยังไม่ได้เชื่อม Supabase</div></>);
  }

  const stat = await getProductStat(itemId);
  const [{ rows }, similar] = await Promise.all([
    listComments({ product: itemId, pageSize: 200, sort: "created_desc" }),
    getSimilarProducts(itemId, stat?.brand ?? null, 12),
  ]);

  const name = stat?.item_name || `สินค้า #${itemId}`;
  const score = stat?.sentiment_score ?? 0;
  const img = stat?.thumbnail_url || stat?.image_url || null;

  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const issues = new Map<string, number>();
  for (const r of rows) {
    if (r.rating != null) dist[Math.min(5, Math.max(1, Math.round(r.rating)))]++;
    if (r.sentiment === "negative" && r.category && r.category !== "เชิงบวก/ชม") issues.set(r.category, (issues.get(r.category) || 0) + 1);
  }
  const topIssues = [...issues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxDist = Math.max(1, ...Object.values(dist));

  // ค่าเฉลี่ยคะแนนของแบรนด์เดียวกัน (เทียบ)
  const peerScores = similar.map((p) => p.sentiment_score);
  const brandAvg = peerScores.length ? Math.round((peerScores.reduce((a, b) => a + b, 0) / peerScores.length) * 10) / 10 : null;

  return (
    <>
      <PageHeader title="โปรไฟล์สินค้า" subtitle={stat?.brand || undefined} />
      <div className="px-7 pt-6 pb-16 max-w-[1680px] mx-auto">
        <Link href="/products" className="text-[13px] text-shopee font-semibold hover:underline">← กลับรายสินค้า</Link>

        {/* header (full width) */}
        <div className="card card-pad mt-3 flex gap-5 max-[640px]:flex-col">
          <div className="w-[150px] h-[150px] rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center flex-none border border-line">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={name} className="w-full h-full object-cover" />
            ) : (<Box className="w-12 h-12 text-slate-300" />)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-snug">{name}</h1>
            <div className="flex items-center gap-2.5 mt-1.5 text-sm flex-wrap">
              <span className="font-semibold">{stat?.brand || "-"}</span>
              {stat?.price != null && <span className="text-shopee font-bold">฿{Number(stat.price).toLocaleString("th-TH")}</span>}
              <span className="text-muted text-[12.5px]">SKU/ID: {stat?.item_sku || itemId}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Mini label="ทิศทาง" value={<span style={{ color: dirColor(score) }}>{directionLabel(score)}</span>} sub={fmtScore(score) + (brandAvg != null ? ` • แบรนด์เฉลี่ย ${fmtScore(brandAvg)}` : "")} />
              <Mini label="รีวิว" value={stat?.total ?? rows.length} />
              <Mini label="ดาวเฉลี่ย" value={<span className="text-neu">{stat?.avg_rating ?? "-"}</span>} />
              <Mini label="ด่วน" value={<span className={stat && stat.urgent_count > 0 ? "text-neg" : ""}>{stat?.urgent_count ?? 0}</span>} />
            </div>
            <div className="mt-4">
              <SentimentBar positive={stat?.positive ?? 0} neutral={stat?.neutral ?? 0} negative={stat?.negative ?? 0} />
              <div className="text-[12px] text-muted mt-1.5">เชิงบวก {stat?.positive ?? 0} • กลาง {stat?.neutral ?? 0} • เชิงลบ {stat?.negative ?? 0}</div>
            </div>
          </div>
        </div>

        {/* main + right rail */}
        <div className="grid gap-5 items-start mt-4 [grid-template-columns:minmax(0,1fr)_340px] max-[1180px]:grid-cols-1">
          <div className="min-w-0 space-y-4">
            <div className="grid gap-4 [grid-template-columns:1fr_1.2fr] max-[800px]:grid-cols-1">
              <div className="card card-pad">
                <h3 className="kpi-label mb-3"><Star className="w-[15px] h-[15px]" /> การกระจายของดาว</h3>
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((s) => (
                    <div key={s} className="flex items-center gap-2.5 text-[13px]">
                      <span className="w-8 text-muted">{s} ★</span>
                      <div className="flex-1 h-[10px] bg-[#f9fafb] rounded-md overflow-hidden"><div style={{ width: `${(dist[s] / maxDist) * 100}%`, height: "100%", background: s >= 4 ? "#16a34a" : s === 3 ? "#d97706" : "#dc2626" }} /></div>
                      <span className="w-8 text-right text-muted">{dist[s]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card card-pad">
                <h3 className="kpi-label mb-3">ปัญหาที่พบ (เชิงลบ)</h3>
                {topIssues.length === 0 ? (<div className="text-muted text-sm py-4 text-center">ไม่มีปัญหาเด่นชัด 👍</div>) : (
                  <div className="flex flex-wrap gap-2">{topIssues.map(([cat, n]) => (<span key={cat} className="chip">{cat} <b className="text-shopee ml-1">{n}</b></span>))}</div>
                )}
                <div className="mt-3"><ScorePill score={score} label={`คะแนนทิศทาง ${fmtScore(score)}`} /></div>
              </div>
            </div>

            <div className="section-title !mt-2">รีวิว / คอมเมนต์ทั้งหมด <span className="text-muted font-medium text-[13px]">({rows.length})</span></div>
            <ProductReviews comments={rows} />
          </div>

          {/* RIGHT RAIL — เปรียบเทียบสินค้าแบรนด์เดียวกัน */}
          <aside className="lg:sticky lg:top-[76px] space-y-3">
            <div className="card card-pad">
              <h3 className="kpi-label mb-1">เปรียบเทียบในแบรนด์ {stat?.brand || "-"}</h3>
              {similar.length === 0 ? (
                <div className="text-muted text-sm py-4 text-center">ไม่มีสินค้าอื่นในแบรนด์นี้</div>
              ) : (
                <>
                  <div className="text-[12px] text-muted mb-2">สินค้านี้ {fmtScore(score)} • แบรนด์เฉลี่ย {brandAvg != null ? fmtScore(brandAvg) : "-"}</div>
                  <div className="space-y-1.5 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
                    {similar.map((p) => {
                      const n = p.item_name || `#${p.product_name}`;
                      return (
                        <Link key={p.product_name} href={`/products/${encodeURIComponent(p.product_name)}`} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="w-9 h-9 rounded-md bg-slate-100 overflow-hidden flex items-center justify-center flex-none border border-line">
                            {p.thumbnail_url || p.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={(p.thumbnail_url || p.image_url) as string} alt="" loading="lazy" className="w-full h-full object-cover" />
                            ) : (<Box className="w-4 h-4 text-slate-300" />)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium leading-tight line-clamp-1">{n}</div>
                            <div className="text-[11px] text-muted flex items-center gap-1"><Star className="w-3 h-3 text-neu" />{p.avg_rating ?? "-"} • {p.total} รีวิว{p.urgent_count > 0 ? ` • ⚠${p.urgent_count}` : ""}</div>
                          </div>
                          <span className="pill !px-2 !py-0.5 text-[11px] flex-none" style={{ background: dirBg(p.sentiment_score), color: dirColor(p.sentiment_score) }}>{fmtScore(p.sentiment_score)}</span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function Mini({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-slate-50 rounded-xl px-3 py-2.5 border border-line/60">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-[17px] font-extrabold leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
