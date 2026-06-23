import ExploreClient from "@/components/ExploreClient";
import PageHeader from "@/components/PageHeader";
import { NoAccess, NotReady } from "@/components/common";
import { allowedBrandsOf, getCurrentProfile } from "@/lib/auth";
import { getDistinct } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await getCurrentProfile();
  if (!canAccess(me, "explore")) return <NoAccess />;
  const configured = hasSupabase();
  if (!configured) {
    return (
      <>
        <PageHeader title="สำรวจคอมเมนต์" subtitle="ค้นหา/กรองคอมเมนต์ทั้งหมด" />
        <NotReady configured={false} />
      </>
    );
  }
  const sp = await searchParams;
  const allowed = allowedBrandsOf(me);
  const { brands: allBrands, categories } = await getDistinct();
  const brands = allowed ? allBrands.filter((b) => allowed.includes(b)) : allBrands;

  return (
    <>
      <PageHeader title="สำรวจคอมเมนต์" subtitle="ค้นหา กรอง และส่งออกคอมเมนต์ทั้งหมด" />
      <ExploreClient
        brands={brands}
        categories={categories}
        initial={{ brand: sp.brand, product: sp.product }}
      />
    </>
  );
}
