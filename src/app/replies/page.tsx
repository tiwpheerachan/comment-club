import PageHeader from "@/components/PageHeader";
import RepliesClient from "@/components/RepliesClient";
import { NoAccess, NotReady } from "@/components/common";
import { allowedBrandsOf, getCurrentProfile } from "@/lib/auth";
import { agentStatsFromReplies, getReplies } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  const profile = await getCurrentProfile();
  if (!canAccess(profile, "replies")) return <NoAccess />;
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="การตอบกลับของทีม" subtitle="ใครตอบคอมเมนต์อะไรไปบ้าง" />
        <NotReady configured={false} />
      </>
    );
  }

  // จำกัดสิทธิ์ตามแบรนด์อย่างเคร่งครัด — ทุกคนเห็น "ใครตอบอะไร" แต่เฉพาะแบรนด์ที่ตนมีสิทธิ์
  const replies = await getReplies({ limit: 2000, brandsIn: allowedBrandsOf(profile) });
  const stats = agentStatsFromReplies(replies);

  return (
    <>
      <PageHeader title="การตอบกลับของทีม" subtitle="ประวัติการตอบกลับ Shopee แยกตามแอดมิน • ใครตอบอะไรไปแล้วบ้าง" />
      <RepliesClient replies={replies} stats={stats} />
    </>
  );
}
