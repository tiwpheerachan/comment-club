import PageHeader from "@/components/PageHeader";
import TrendsClient from "@/components/TrendsClient";
import { NoAccess, NotReady } from "@/components/common";
import { getCurrentProfile } from "@/lib/auth";
import { getBrandStats, getCategoryDaily, getDailyBrandTrend, getDailyTrend, getProductStats } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  if (!canAccess(await getCurrentProfile(), "trends")) return <NoAccess />;
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
