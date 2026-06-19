import PageHeader from "@/components/PageHeader";
import TriageClient from "@/components/TriageClient";
import { NotReady } from "@/components/common";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default function TriagePage() {
  if (!hasSupabase()) {
    return (
      <>
        <PageHeader title="ศูนย์จัดการด่วน" subtitle="คิวคอมเมนต์ที่ต้องรีบช่วยเหลือ" />
        <NotReady configured={false} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="ศูนย์จัดการด่วน" subtitle="คิวคอมเมนต์ด่วน — รับเรื่อง / มอบหมาย / ปิดงาน" />
      <TriageClient />
    </>
  );
}
