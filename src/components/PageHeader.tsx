export default function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="bg-white border-b border-line px-7 h-[60px] flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-[16px] font-bold tracking-tight leading-none">{title}</h1>
        {subtitle && <div className="text-[12px] text-muted mt-1">{subtitle}</div>}
      </div>
      {right && <div className="flex items-center gap-2.5">{right}</div>}
    </div>
  );
}
