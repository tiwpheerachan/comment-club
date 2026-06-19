-- ============================================================
--  0012 — Auth & RBAC: profiles (ผูกกับ auth.users) + บทบาท + สิทธิ์ดูแบรนด์
-- ============================================================
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  name           text,
  role           text default 'staff',     -- super_admin | admin | staff
  allowed_brands text[] default '{}',      -- ว่าง = เห็นทุกแบรนด์ ; มีค่า = จำกัดเฉพาะแบรนด์เหล่านี้
  active         boolean default true,
  created_at     timestamptz default now()
);

alter table public.profiles enable row level security;

-- ผู้ใช้อ่านโปรไฟล์ตัวเองได้ (การจัดการทั้งหมดทำผ่าน service-role ใน /api/admin)
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
