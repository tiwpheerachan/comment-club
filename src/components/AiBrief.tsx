"use client";
import { useState } from "react";
import { Forecast as FIcon, Info } from "./icons";

/**
 * ปุ่ม + กล่องบทวิเคราะห์ AI (เรียก /api/forecast-brief)
 * facts ถูกประกอบจากผลคำนวณฝั่ง client แล้วส่งให้ Claude เรียบเรียงเป็นบทความ
 */
export default function AiBrief({ kind, title, facts }: { kind: "product" | "sales"; title: string; facts: Record<string, unknown> }) {
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/forecast-brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, title, facts }),
      });
      const d = await r.json();
      if (d.ok && d.article) setArticle(d.article);
      else setError(d.error || "สร้างบทวิเคราะห์ไม่สำเร็จ");
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ");
    } finally { setLoading(false); }
  }

  return (
    <div className="card card-pad">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <h3 className="text-[15px] font-bold text-ink flex items-center gap-2"><FIcon className="w-4 h-4 text-shopee" /> บทวิเคราะห์ AI</h3>
        <button onClick={run} disabled={loading} className="text-[12.5px] font-semibold rounded-lg px-3.5 py-1.5 bg-shopee text-white disabled:opacity-50 hover:opacity-90 transition">
          {loading ? "กำลังวิเคราะห์…" : article ? "วิเคราะห์ใหม่" : "✨ สร้างบทวิเคราะห์"}
        </button>
      </div>
      <p className="text-[12px] text-muted mb-3">Claude สรุปจากผลพยากรณ์ทั้งหมด (โมเดล • ดีมานด์ • ราคา • รีวิว • แคมเปญ • สต๊อก) เป็นบทความสั้นพร้อมคำแนะนำ</p>

      {error && <div className="text-[13px] text-neg flex items-start gap-2"><Info className="w-4 h-4 flex-none mt-0.5" />{error}</div>}
      {!article && !error && !loading && <div className="text-[12.5px] text-muted py-1">กดปุ่มเพื่อให้ AI อ่านตัวเลขทั้งหมดแล้วเขียนสรุป + แนะนำสิ่งที่ควรทำ</div>}
      {loading && <div className="text-[12.5px] text-muted py-1 animate-pulse">AI กำลังอ่านผลวิเคราะห์และเรียบเรียง…</div>}
      {article && <Markdown text={article} />}
    </div>
  );
}

/** ตัวเรนเดอร์ markdown แบบเบา (รองรับ **ตัวหนา**, bullet, หัวข้อ) */
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-[13.5px] text-ink/90 leading-relaxed">
      {lines.map((ln, i) => {
        const t = ln.trim();
        if (!t) return <div key={i} className="h-1" />;
        const bullet = /^[-*•]\s+/.test(t);
        const content = bullet ? t.replace(/^[-*•]\s+/, "") : t;
        return (
          <div key={i} className={bullet ? "flex items-start gap-2 pl-1" : ""}>
            {bullet && <span className="text-shopee mt-0.5">•</span>}
            <span dangerouslySetInnerHTML={{ __html: inline(content) }} />
          </div>
        );
      })}
    </div>
  );
}

// แปลง **ตัวหนา** → <strong> และกัน XSS เบื้องต้น (escape ก่อน แล้วค่อยใส่ tag)
function inline(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-ink">$1</strong>');
}
