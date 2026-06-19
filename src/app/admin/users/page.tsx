import PageHeader from "@/components/PageHeader";
import UsersAdmin from "@/components/UsersAdmin";
import { getCurrentProfile } from "@/lib/auth";
import { getDistinct } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await getCurrentProfile();
  if (me?.role !== "super_admin") {
    return (
      <>
        <PageHeader title="พนักงาน / ผู้ใช้" />
        <div className="p-7"><div className="card card-pad text-neg">เฉพาะผู้ดูแลระบบสูงสุด (super admin) เท่านั้นที่เข้าถึงได้</div></div>
      </>
    );
  }
  const { brands } = await getDistinct();
  return (
    <>
      <PageHeader title="พนักงาน / ผู้ใช้" subtitle="สร้าง/แก้ไข/ลบบัญชี • กำหนดบทบาท • กำหนดสิทธิ์ดูแบรนด์ • เปลี่ยนรหัสผ่าน" />
      <UsersAdmin brands={brands} />
    </>
  );
}
