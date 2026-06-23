import PageHeader from "@/components/PageHeader";
import StockClient from "@/components/StockClient";
import { NoAccess, NotReady } from "@/components/common";
import { getCurrentProfile } from "@/lib/auth";
import { getProductBrands, getProductCatalog } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  if (!canAccess(await getCurrentProfile(), "stock")) return <NoAccess />;
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="พยากรณ์สินค้า & สต๊อก" subtitle="ความพร้อมสต๊อก + คาดดีมานด์รายสินค้า" />
        <NotReady configured={false} />
      </>
    );
  }

  const [products, brands] = await Promise.all([getProductCatalog({ limit: 3000 }), getProductBrands()]);

  return (
    <>
      <PageHeader title="พยากรณ์สินค้า & สต๊อก" subtitle="ความพร้อมสต๊อก • จุดสั่งซื้อใหม่ • คาดดีมานด์รายสินค้า" />
      <StockClient products={products} brands={brands} />
    </>
  );
}
