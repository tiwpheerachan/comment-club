"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { setAdminName } from "@/lib/admin";
import { canAccess } from "@/lib/pages";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alert, Bars, Box, Compass, Gear, Logout, Search, Shield, Trend, Users } from "./icons";
import Logo from "./Logo";

const NAV = [
  { href: "/", key: "overview", label: "ภาพรวม", Icon: Compass },
  { href: "/brands", key: "brands", label: "รายแบรนด์", Icon: Bars },
  { href: "/products", key: "products", label: "รายสินค้า", Icon: Box },
  { href: "/explore", key: "explore", label: "สำรวจคอมเมนต์", Icon: Search },
  { href: "/triage", key: "triage", label: "ศูนย์จัดการด่วน", Icon: Alert },
  { href: "/retention", key: "retention", label: "Retention ลูกค้า", Icon: Users },
  { href: "/trends", key: "trends", label: "เทรนด์ / รายงาน", Icon: Trend },
  { href: "/settings", key: "settings", label: "ตั้งค่า", Icon: Gear },
];

const ROLE_LABEL: Record<string, string> = { super_admin: "ผู้ดูแลระบบสูงสุด", admin: "ผู้ดูแล", staff: "พนักงาน" };

export default function Sidebar({ user }: { user: { name: string | null; email: string | null; role: string; allowed_pages?: string[] } }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const display = user.name || user.email || "ผู้ใช้";
  const nav = NAV.filter((n) => canAccess(user, n.key));

  // seed ชื่อผู้ใช้จริงให้ระบบ actor (ใช้ใน triage/reply)
  useEffect(() => { if (user.name || user.email) setAdminName(user.name || user.email || ""); }, [user.name, user.email]);

  async function logout() {
    await createSupabaseBrowser().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="w-[230px] flex-none bg-white border-r border-line h-screen sticky top-0 flex flex-col">
      <div className="flex flex-col justify-center px-5 h-[64px] border-b border-line">
        <Logo scriptSize={28} clubSize={22} />
        <div className="text-[10.5px] text-muted ml-[11px] mt-0.5 tracking-wide">Comment & Customer Intelligence</div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm transition-colors ${active(href) ? "bg-shopee/10 text-shopee font-semibold" : "text-ink/80 hover:bg-gray-100"}`}>
            <Icon className="w-[18px] h-[18px]" /> {label}
          </Link>
        ))}
        {user.role === "super_admin" && (
          <Link href="/admin/users" className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm transition-colors ${active("/admin/users") ? "bg-shopee/10 text-shopee font-semibold" : "text-ink/80 hover:bg-gray-100"}`}>
            <Shield className="w-[18px] h-[18px]" /> พนักงาน / ผู้ใช้
          </Link>
        )}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-cc text-white flex items-center justify-center text-[13px] font-bold flex-none">{display.charAt(0).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold truncate">{display}</div>
            <div className="text-[10.5px] text-muted truncate">{ROLE_LABEL[user.role] || user.role}</div>
          </div>
          <button onClick={logout} title="ออกจากระบบ" className="text-muted hover:text-neg p-1.5 rounded-lg hover:bg-gray-100">
            <Logout className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}
