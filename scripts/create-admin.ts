// สร้าง super admin คนแรก:  npm run create-admin <email> <password> [ชื่อ]
import "./_env";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, password, name] = process.argv.slice(2);

async function main() {
  if (!url || !key) throw new Error("ต้องตั้ง NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY");
  if (!email || !password) throw new Error("ใช้: npm run create-admin <email> <password> [ชื่อ]");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // ถ้ามีผู้ใช้อยู่แล้วให้ promote เป็น super_admin
  const { data: created, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  let userId = created?.user?.id;
  if (error) {
    if (!/already/i.test(error.message)) throw error;
    const { data: list } = await sb.auth.admin.listUsers();
    userId = list.users.find((u) => u.email === email)?.id;
    if (userId) await sb.auth.admin.updateUserById(userId, { password });
    console.log("ผู้ใช้มีอยู่แล้ว → อัปเดตรหัส + ตั้งเป็น super admin");
  }
  if (!userId) throw new Error("หา user id ไม่เจอ");

  await sb.from("profiles").upsert({ id: userId, email, name: name || email, role: "super_admin", allowed_brands: [], active: true });
  console.log(`✓ super admin พร้อมใช้: ${email}`);
}

main().catch((e) => { console.error("ล้มเหลว:", e instanceof Error ? e.message : e); process.exit(1); });
