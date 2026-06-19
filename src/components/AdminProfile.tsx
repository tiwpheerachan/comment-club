"use client";
import { useEffect, useState } from "react";
import { getAdminName, setAdminName } from "@/lib/admin";

export default function AdminProfile() {
  const [name, setName] = useState("");
  const [edit, setEdit] = useState(false);
  useEffect(() => setName(getAdminName()), []);

  const save = (v: string) => { setAdminName(v); setName(v.trim()); setEdit(false); };
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="border-t border-line p-3">
      {edit ? (
        <input
          autoFocus
          defaultValue={name}
          placeholder="ชื่อแอดมิน…"
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save((e.target as HTMLInputElement).value); }}
          className="w-full border border-line rounded-lg px-2.5 py-1.5 text-[13px]"
        />
      ) : (
        <button onClick={() => setEdit(true)} className="flex items-center gap-2.5 w-full text-left hover:bg-gray-100 rounded-lg p-1.5">
          <span className="w-8 h-8 rounded-full bg-cc text-white flex items-center justify-center text-[13px] font-bold flex-none">{initial}</span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold truncate">{name || "ตั้งชื่อแอดมิน"}</span>
            <span className="block text-[10.5px] text-muted">แตะเพื่อแก้ไขโปรไฟล์</span>
          </span>
        </button>
      )}
    </div>
  );
}
