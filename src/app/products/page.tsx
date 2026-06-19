import PageHeader from "@/components/PageHeader";
import ProductsGrid from "@/components/ProductsGrid";
import { NotReady } from "@/components/common";
import { getProductStats } from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const configured = hasSupabase();
  const all = configured ? await getProductStats({ worstFirst: true, limit: 2000 }) : [];
  const products = all.filter((p) => p.total >= 2);

  if (products.length === 0) {
    return (
      <>
        <PageHeader title="รายสินค้า" subtitle="สินค้าที่ต้องโฟกัส และสินค้าที่รีวิวดี" />
        <NotReady configured={configured} />
      </>
    );
  }

  const needFocus = products.filter((p) => p.sentiment_score < 15 || p.urgent_count > 0).length;
  const avgScore =
    Math.round((products.reduce((s, p) => s + p.sentiment_score, 0) / products.length) * 10) / 10;
  const withUrgent = products.reduce((s, p) => s + p.urgent_count, 0);

  return (
    <>
      <PageHeader title="รายสินค้า" subtitle={`${products.length} สินค้า (มี ≥2 คอมเมนต์) • คลิกการ์ดเพื่อดูคอมเมนต์`} />

      {/* KPI strip */}
      <div className="px-7 pt-6">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <Stat label="สินค้าทั้งหมด" value={products.length.toLocaleString("th-TH")} />
          <Stat label="ต้องโฟกัส (คะแนน<15 หรือมีด่วน)" value={needFocus.toLocaleString("th-TH")} tone="neg" />
          <Stat label="คะแนนเฉลี่ยสินค้า" value={(avgScore > 0 ? "+" : "") + avgScore} />
          <Stat label="คอมเมนต์ด่วนรวม" value={withUrgent.toLocaleString("th-TH")} tone={withUrgent > 0 ? "neg" : undefined} />
        </div>
      </div>

      <ProductsGrid products={products} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "neg" }) {
  return (
    <div className="card card-pad">
      <div className="kpi-label">{label}</div>
      <div className={`text-[26px] font-extrabold mt-1 ${tone === "neg" ? "text-neg" : "text-ink"}`}>{value}</div>
    </div>
  );
}
