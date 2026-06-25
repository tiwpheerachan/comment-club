/** รูปสินค้าขนาดเล็ก (มี placeholder ถ้าไม่มีรูป) — ใช้ในรายการคอมเมนต์ */
export default function ProductThumb({ src, size = 44, className = "" }: { src?: string | null; size?: number; className?: string }) {
  return (
    <div className={`rounded-lg overflow-hidden bg-slate-100 border border-line flex-none grid place-items-center ${className}`} style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
        : <span className="text-slate-300" style={{ fontSize: size * 0.42 }}>📦</span>}
    </div>
  );
}
