"use client";
import { useState } from "react";

/** แสดงรูปย่อจากคอมเมนต์ + คลิกเพื่อดูเต็มจอ (lightbox) */
export default function ImageThumbs({
  images,
  size = 52,
  max = 4,
}: {
  images?: string[] | null;
  size?: number;
  max?: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const imgs = (images || []).filter(Boolean);
  if (imgs.length === 0) return null;

  const shown = imgs.slice(0, max);
  const extra = imgs.length - shown.length;

  return (
    <>
      <div className="flex gap-1.5 flex-wrap mt-2">
        {shown.map((src, i) => (
          <button
            key={i}
            onClick={() => setOpen(src)}
            className="relative rounded-lg overflow-hidden border border-line bg-slate-50 hover:ring-2 hover:ring-shopee/40 transition"
            style={{ width: size, height: size }}
            title="คลิกเพื่อดูรูปเต็ม"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="รูปจากลูกค้า" loading="lazy" className="w-full h-full object-cover" />
            {i === shown.length - 1 && extra > 0 && (
              <span className="absolute inset-0 bg-black/55 text-white text-xs font-bold flex items-center justify-center">
                +{extra}
              </span>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          onClick={() => setOpen(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open} alt="รูปจากลูกค้า" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
            <div className="flex gap-1.5 mt-2 justify-center flex-wrap">
              {imgs.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setOpen(src)}
                  className={`w-12 h-12 rounded overflow-hidden border-2 ${src === open ? "border-shopee" : "border-transparent opacity-70"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setOpen(null)}
            className="absolute top-4 right-5 text-white/80 hover:text-white text-3xl leading-none"
            aria-label="ปิด"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
