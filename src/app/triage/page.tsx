import PageHeader from "@/components/PageHeader";
import TriageClient from "@/components/TriageClient";
import { NoAccess, NotReady } from "@/components/common";
import { allowedBrandsOf, getCurrentProfile } from "@/lib/auth";
import { getDistinct, getSystemUsers } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function TriagePage() {
  if (!canAccess(await getCurrentProfile(), "triage")) return <NoAccess />;
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="ศูนย์จัดการด่วน" subtitle="คิวคอมเมนต์ที่ต้องรีบช่วยเหลือ" />
        <NotReady configured={false} />
      </>
    );
  }
  const [{ brands: allBrands }, users, profile] = await Promise.all([getDistinct(), getSystemUsers(), getCurrentProfile()]);
  const allowed = allowedBrandsOf(profile);
  const brands = allowed ? allBrands.filter((b) => allowed.includes(b)) : allBrands;
  return (
    <>
      <PageHeader title="ศูนย์จัดการด่วน" subtitle="คิวคอมเมนต์ด่วน — รับเรื่อง / มอบหมาย / ตอบกลับ / ปิดงาน" />
      <TriageClient brands={brands} users={users.map((u) => ({ name: u.name, avatar: u.avatar_url }))} />
    </>
  );
}
