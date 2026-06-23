import PageHeader from "@/components/PageHeader";
import RetentionClient from "@/components/RetentionClient";
import { NoAccess, NotReady } from "@/components/common";
import { getCurrentProfile } from "@/lib/auth";
import { getRetention } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RetentionPage() {
  if (!canAccess(await getCurrentProfile(), "retention")) return <NoAccess />;
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
