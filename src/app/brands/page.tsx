import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { NotReady, ScorePill, SentimentBar, SentimentLegend } from "@/components/common";
import { Star } from "@/components/icons";
import { directionLabel } from "@/lib/aggregate";
import { allowedBrandsOf, getCurrentProfile } from "@/lib/auth";
import { getBrandStats } from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";
import { fmtScore } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const configured = hasSupabase();
  const allowed = allowedBrandsOf(await getCurrentProfile());
  const all = configured ? await getBrandStats() : [];
  const brands = allowed ? all.filter((b) => allowed.includes(b.brand)) : all;

  if (brands.length === 0) {
    return (
      <>
        <PageHeader title="รายแบรนด์" subtitle="เปรียบเทียบทิศทางและปัญหาของแต่ละแบรนด์" />
        <NotReady configured={configured} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="รายแบรนด์" subtitle={`${brands.length} แบรนด์ • เรียงจากแย่สุด → ดีสุด`} />
      <div className="p-7">
        <div className="flex justify-end mb-2"><SentimentLegend /></div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="text-left p-3.5 font-semibold">แบรนด์</th>
                <th className="text-left p-3.5 font-semibold">คอมเมนต์</th>
                <th className="text-left p-3.5 font-semibold w-[180px]">สัดส่วน บวก/กลาง/ลบ</th>
                <th className="text-right p-3.5 font-semibold">ดาวเฉลี่ย</th>
                <th className="text-right p-3.5 font-semibold">ด่วน</th>
                <th className="text-right p-3.5 font-semibold">ทิศทาง</th>
                <th className="p-3.5"></th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.brand} className="border-b border-[#eef0f3] last:border-0">
                  <td className="p-3.5 font-semibold">{b.brand}</td>
                  <td className="p-3.5">{b.total}</td>
                  <td className="p-3.5">
                    <SentimentBar positive={b.positive} neutral={b.neutral} negative={b.negative} />
                  </td>
                  <td className="p-3.5 text-right whitespace-nowrap">
                    {b.avg_rating ?? "-"} <Star className="w-[13px] h-[13px] inline text-neu" />
                  </td>
                  <td className="p-3.5 text-right">
                    <span className={b.urgent_count > 0 ? "text-neg font-semibold" : "text-muted"}>
                      {b.urgent_count}
                    </span>
                  </td>
                  <td className="p-3.5 text-right whitespace-nowrap">
                    <ScorePill score={b.sentiment_score} label={`${directionLabel(b.sentiment_score)} ${fmtScore(b.sentiment_score)}`} />
                  </td>
                  <td className="p-3.5 text-right">
                    <Link href={`/explore?brand=${encodeURIComponent(b.brand)}`} className="text-shopee text-xs font-semibold hover:underline">
                      ดูคอมเมนต์ →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
