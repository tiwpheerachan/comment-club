import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StockDetailClient from "@/components/StockDetailClient";
import { NoAccess } from "@/components/common";
import { getCurrentProfile } from "@/lib/auth";
import { getEnvDaily, getProductCatalogOne, getProductDemand } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import type { EnvMonthly } from "@/lib/product-analytics";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!canAccess(await getCurrentProfile(), "stock")) return <NoAccess />;
  const { id } = await params;

  const [product, demand, env] = await Promise.all([getProductCatalogOne(id), getProductDemand(id), getEnvDaily()]);

  if (!product) {
    return (
      <>
        <PageHeader title="ไม่พบสินค้า" subtitle={id} />
        <div className="px-7 py-8"><Link href="/stock" className="text-shopee font-semibold">← กลับไปรายการสินค้า</Link></div>
      </>
    );
  }

  // รวมปัจจัยแวดล้อมรายเดือน (pm2.5/อุณหภูมิ เฉลี่ย, ฝนรวม)
  const em = new Map<string, { pm: number[]; t: number[]; p: number }>();
  for (const e of env) {
    const m = e.date.slice(0, 7);
    const b = em.get(m) ?? { pm: [], t: [], p: 0 };
    if (e.pm2_5 != null) b.pm.push(e.pm2_5);
    if (e.temp_mean != null) b.t.push(e.temp_mean);
    if (e.precip != null) b.p += e.precip;
    em.set(m, b);
  }
  const avg = (a: number[]) => (a.length ? +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1) : null);
  const envMonthly: EnvMonthly[] = [...em.entries()].sort().map(([month, b]) => ({ month, pm2_5: avg(b.pm), temp_mean: avg(b.t), precip: +b.p.toFixed(1) }));

  return (
    <>
      <PageHeader title={product.name || product.product_id} subtitle={`${product.brand || "-"} • รหัส ${product.product_id}`} />
      <StockDetailClient product={product} demand={demand} envMonthly={envMonthly} />
    </>
  );
}
