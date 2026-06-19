// โลโก้ commentclub — "comment" script + "club" sans สีเขียว sage + เอฟเฟคเขียนมือ
export default function Logo({ scriptSize = 30, clubSize = 23, animate = true }: { scriptSize?: number; clubSize?: number; animate?: boolean }) {
  return (
    <div className="flex items-stretch gap-2 text-cc select-none" aria-label="commentclub">
      <span className="block w-[3px] rounded-full bg-cc/70 self-stretch my-0.5" />
      <div className={`leading-none whitespace-nowrap ${animate ? "cc-reveal" : ""}`}>
        <span className="font-script align-baseline pr-3" style={{ fontSize: scriptSize, lineHeight: 1 }}>comment</span>
        <span className="font-display font-semibold tracking-tight align-baseline" style={{ fontSize: clubSize }}>club</span>
      </div>
    </div>
  );
}
