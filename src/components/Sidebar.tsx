"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert, Bars, Box, Compass, Gear, Search, Trend, Users } from "./icons";
import AdminProfile from "./AdminProfile";
import Logo from "./Logo";

const NAV = [
  { href: "/", label: "ภาพรวม", Icon: Compass },
  { href: "/brands", label: "รายแบรนด์", Icon: Bars },
  { href: "/products", label: "รายสินค้า", Icon: Box },
  { href: "/explore", label: "สำรวจคอมเมนต์", Icon: Search },
  { href: "/triage", label: "ศูนย์จัดการด่วน", Icon: Alert },
  { href: "/retention", label: "Retention ลูกค้า", Icon: Users },
  { href: "/trends", label: "เทรนด์ / รายงาน", Icon: Trend },
  { href: "/settings", label: "ตั้งค่า", Icon: Gear },
];

export default function Sidebar() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="w-[230px] flex-none bg-white border-r border-line h-screen sticky top-0 flex flex-col">
      <div className="flex flex-col justify-center px-5 h-[64px] border-b border-line">
        <Logo scriptSize={28} clubSize={22} />
        <div className="text-[10.5px] text-muted ml-[11px] mt-0.5 tracking-wide">Comment & Customer Intelligence</div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm transition-colors ${
              active(href)
                ? "bg-shopee/10 text-shopee font-semibold"
                : "text-ink/80 hover:bg-gray-100"
            }`}
          >
            <Icon className="w-[18px] h-[18px]" />
            {label}
          </Link>
        ))}
      </nav>

      <AdminProfile />
      <div className="px-4 pb-3 text-[10.5px] text-muted">ข้อมูลจาก BigQuery → Supabase</div>
    </aside>
  );
}
