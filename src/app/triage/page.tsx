import PageHeader from "@/components/PageHeader";
import TriageClient from "@/components/TriageClient";
import { NotReady } from "@/components/common";
import { getDistinct, getTeam } from "@/lib/db";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="ศูนย์จัดการด่วน" subtitle="คิวคอมเมนต์ที่ต้องรีบช่วยเหลือ" />
        <NotReady configured={false} />
      </>
    );
  }
  const [{ brands }, team] = await Promise.all([getDistinct(), getTeam()]);
  return (
    <>
      <PageHeader title="ศูนย์จัดการด่วน" subtitle="คิวคอมเมนต์ด่วน — รับเรื่อง / มอบหมาย / ตอบกลับ / ปิดงาน" />
      <TriageClient brands={brands} team={team.map((t) => t.name)} />
    </>
  );
}
