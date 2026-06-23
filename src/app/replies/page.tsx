import PageHeader from "@/components/PageHeader";
import RepliesClient from "@/components/RepliesClient";
import { NoAccess, NotReady } from "@/components/common";
import { getCurrentProfile } from "@/lib/auth";
import { getReplies, getReplyAgentStats } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  if (!canAccess(await getCurrentProfile(), "replies")) return <NoAccess />;
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="การตอบกลับของทีม" subtitle="ใครตอบคอมเมนต์อะไรไปบ้าง" />
        <NotReady configured={false} />
      </>
    );
  }

  const [replies, stats] = await Promise.all([getReplies({ limit: 1000 }), getReplyAgentStats()]);

  return (
    <>
      <PageHeader title="การตอบกลับของทีม" subtitle="ประวัติการตอบกลับ Shopee แยกตามแอดมิน • ใครตอบอะไรไปแล้วบ้าง" />
      <RepliesClient replies={replies} stats={stats} />
    </>
  );
}
