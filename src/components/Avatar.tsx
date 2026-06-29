/** รูปโปรไฟล์กลม — ถ้าไม่มีรูปจะแสดงอักษรย่อชื่อบนพื้นสีแบรนด์ */
export default function Avatar({ src, name, size = 28, className = "" }: { src?: string | null; name?: string | null; size?: number; className?: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  if (src) {
    return <img src={src} alt={name || ""} className={`rounded-full object-cover flex-none border border-line ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    <span className={`rounded-full flex-none grid place-items-center bg-shopee/15 text-shopee font-bold ${className}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial}
    </span>
  );
}
