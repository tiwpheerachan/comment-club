import PageHeader from "@/components/PageHeader";
import RetentionClient from "@/components/RetentionClient";
import { NotReady } from "@/components/common";
import { getRetention } from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RetentionPage() {
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="Customer Retention" subtitle="การรักษาฐานลูกค้า & ซื้อซ้ำ" />
        <NotReady configured={false} />
      </>
    );
  }
  const data = await getRetention();
  return (
    <>
      <PageHeader title="Customer Retention" subtitle="การรักษาฐานลูกค้าเดิม • อัตราซื้อซ้ำ • ลูกค้า VIP (จากออเดอร์จริง)" />
      <RetentionClient data={data} />
    </>
  );
}
