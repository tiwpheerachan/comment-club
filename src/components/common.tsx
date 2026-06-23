import { dirBg, dirColor, fmtScore } from "@/lib/ui";

export function ScorePill({ score, label }: { score: number; label?: string }) {
  return (
    <span className="pill" style={{ background: dirBg(score), color: dirColor(score) }}>
      {label ? label : fmtScore(score)}
    </span>
  );
}

/** สีอารมณ์มาตรฐานทั้งระบบ */
export const SENT_COLOR = { positive: "#16a34a", neutral: "#f59e0b", negative: "#ef4444" };

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
  const pct = (n: number) => Math.round((n / tot) * 100);
  const seg = (n: number, color: string, label: string) =>
    n > 0 ? (
      <div
        className="h-full"
        style={{ width: `${(n / tot) * 100}%`, minWidth: 6, background: color }}
        title={`${label} ${n.toLocaleString("th-TH")} (${pct(n)}%)`}
      />
    ) : null;
  return (
    <div className="flex h-[12px] rounded-full overflow-hidden bg-slate-100 min-w-[120px] gap-[1.5px]">
      {seg(positive, SENT_COLOR.positive, "บวก")}
      {seg(neutral, SENT_COLOR.neutral, "กลาง")}
      {seg(negative, SENT_COLOR.negative, "ลบ")}
    </div>
  );
}

/** legend สีอารมณ์ (วางไว้บนตาราง/การ์ด) */
export function SentimentLegend() {
  return (
    <div className="flex items-center gap-3 text-[11.5px] text-muted">
      {([["บวก", SENT_COLOR.positive], ["กลาง", SENT_COLOR.neutral], ["ลบ", SENT_COLOR.negative]] as const).map(([l, c]) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} /> {l}
        </span>
      ))}
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

export function NoAccess() {
  return (
    <div className="p-7">
      <div className="card card-pad max-w-xl">
        <h2 className="font-bold text-neg mb-1.5">ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
        <p className="text-muted text-sm">บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าถึงแท็บนี้ — ติดต่อผู้ดูแลระบบ (super admin) เพื่อขอสิทธิ์</p>
      </div>
    </div>
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
