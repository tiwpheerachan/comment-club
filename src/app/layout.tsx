import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Poppins, Yellowtail } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const fontThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-thai",
  display: "swap",
});
const fontScript = Yellowtail({ subsets: ["latin"], weight: "400", variable: "--font-script", display: "swap" });
const fontDisplay = Poppins({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "commentclub — ศูนย์วิเคราะห์คอมเมนต์ & ลูกค้า",
  description: "commentclub: วิเคราะห์คอมเมนต์ Shopee + Customer Retention จาก BigQuery ด้วย AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${fontThai.variable} ${fontScript.variable} ${fontDisplay.variable}`}>
      <body className="font-sans antialiased">
        <div className="flex min-h-screen bg-[#f6f7f9]">
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
