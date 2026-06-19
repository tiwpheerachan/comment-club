import PageHeader from "@/components/PageHeader";
import TrendsClient from "@/components/TrendsClient";
import { NotReady } from "@/components/common";
import { getBrandStats, getCategoryDaily, getDailyBrandTrend, getDailyTrend, getProductStats } from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="เทรนด์ / รายงาน" subtitle="แนวโน้มและการวิเคราะห์อัตโนมัติ" />
        <NotReady configured={false} />
      </>
    );
  }

  const [daily, brandDaily, categoryDaily, brands, products] = await Promise.all([
    getDailyTrend(),
    getDailyBrandTrend(),
    getCategoryDaily(),
    getBrandStats(),
    getProductStats({ worstFirst: true, limit: 2000 }),
  ]);

  return (
    <>
      <PageHeader title="เทรนด์ / รายงาน" subtitle="แนวโน้มเชิงลึก • เปรียบเทียบช่วงเวลา • ข้อสังเกตอัตโนมัติ" />
      <TrendsClient daily={daily} brandDaily={brandDaily} categoryDaily={categoryDaily} brands={brands} products={products.filter((p) => p.total >= 2)} />
    </>
  );
}
