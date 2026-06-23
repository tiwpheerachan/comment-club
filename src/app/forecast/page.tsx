import PageHeader from "@/components/PageHeader";
import ForecastClient from "@/components/ForecastClient";
import { NoAccess, NotReady } from "@/components/common";
import { getCurrentProfile } from "@/lib/auth";
import { getGmvDaily, getGmvScopes } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  if (!canAccess(await getCurrentProfile(), "forecast")) return <NoAccess />;
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="พยากรณ์ยอดขาย" subtitle="คาดการณ์ยอดขายล่วงหน้าจากข้อมูลจริง" />
        <NotReady configured={false} />
      </>
    );
  }

  const [all, scopes] = await Promise.all([getGmvDaily("ALL"), getGmvScopes()]);

  return (
    <>
      <PageHeader title="พยากรณ์ยอดขาย" subtitle="เทรนด์ × ฤดูกาลรายสัปดาห์ • ตรวจจับวันแคมเปญ • คาดยอดปิดเดือน" />
      <ForecastClient initial={all} platforms={scopes.platforms} brands={scopes.brands} />
    </>
  );
}
