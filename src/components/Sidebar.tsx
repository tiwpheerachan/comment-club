"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Alert, Bars, Box, Chat, Compass, Gear, Search, Trend } from "./icons";

const NAV = [
  { href: "/", label: "ภาพรวม", Icon: Compass },
  { href: "/brands", label: "รายแบรนด์", Icon: Bars },
  { href: "/products", label: "รายสินค้า", Icon: Box },
  { href: "/explore", label: "สำรวจคอมเมนต์", Icon: Search },
  { href: "/triage", label: "ศูนย์จัดการด่วน", Icon: Alert },
  { href: "/trends", label: "เทรนด์ / รายงาน", Icon: Trend },
  { href: "/settings", label: "ตั้งค่า", Icon: Gear },
];

export default function Sidebar() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="w-[230px] flex-none bg-white border-r border-line h-screen sticky top-0 flex flex-col">
      <div className="flex items-center gap-2.5 px-5 h-[60px] border-b border-line">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-shopee to-shopee-light flex items-center justify-center text-white">
          <Chat className="w-5 h-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">Shopee AI</div>
          <div className="text-[11px] text-muted">Comment Intelligence</div>
        </div>
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

      <div className="p-4 text-[11px] text-muted border-t border-line">
        ข้อมูลจาก BigQuery → Supabase
      </div>
    </aside>
  );
}
