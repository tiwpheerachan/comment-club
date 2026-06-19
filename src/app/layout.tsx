import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const fontThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Shopee Comment AI — ศูนย์วิเคราะห์คอมเมนต์",
  description: "ดึงคอมเมนต์จาก BigQuery วิเคราะห์ด้วย Claude — ทิศทางร้าน / ปัญหา / คอมเมนต์ด่วน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={fontThai.variable}>
      <body className="font-sans antialiased">
        <div className="flex min-h-screen bg-[#f6f7f9]">
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
