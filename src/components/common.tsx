import { dirBg, dirColor, fmtScore } from "@/lib/ui";

export function ScorePill({ score, label }: { score: number; label?: string }) {
  return (
    <span className="pill" style={{ background: dirBg(score), color: dirColor(score) }}>
      {label ? label : fmtScore(score)}
    </span>
  );
}

export function SentimentBar({
  positive,
  neutral,
  negative,
}: {
  positive: number;
  neutral: number;
  negative: number;
}) {
  const tot = Math.max(1, positive + neutral + negative);
  return (
    <div className="h-[9px] rounded-md bg-[#f9fafb] overflow-hidden flex min-w-[120px]" title="บวก / กลาง / ลบ">
      <i style={{ width: `${(positive / tot) * 100}%`, background: "#16a34a" }} />
      <i style={{ width: `${(neutral / tot) * 100}%`, background: "#d97706" }} />
      <i style={{ width: `${(negative / tot) * 100}%`, background: "#dc2626" }} />
    </div>
  );
}

export function SentChip({ s }: { s: string | null }) {
  const map: Record<string, [string, string, string]> = {
    positive: ["#e8f7ee", "#16a34a", "บวก"],
    neutral: ["#fdf3e3", "#d97706", "กลาง"],
    negative: ["#fdecec", "#dc2626", "ลบ"],
  };
  const [bg, fg, label] = map[s ?? "neutral"] ?? ["#eef0f3", "#475569", s ?? "-"];
  return (
    <span className="pill" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

export function NotReady({ configured }: { configured: boolean }) {
  return (
    <div className="p-7">
      <div className="card card-pad max-w-2xl">
        <h2 className="font-bold mb-1.5">ยังไม่มีข้อมูล</h2>
        <p className="text-muted text-sm leading-relaxed">
          {configured
            ? "เชื่อม Supabase แล้ว แต่ยังไม่มีคอมเมนต์ — รัน pipeline เพื่อดึงจาก BigQuery (npm run pipeline หรือกดปุ่มในหน้า ตั้งค่า)"
            : "ยังไม่ได้เชื่อม Supabase — ตั้งค่า env แล้วรัน sql/0001_init.sql, 0002, 0003"}
        </p>
      </div>
    </div>
  );
}
