"use client";
import { useEffect, useState } from "react";
import { getAdminName, getDefaultBrand, getRole, setAdminName, setDefaultBrand, setRole } from "@/lib/admin";

export default function ProfileSettings({ brands }: { brands: string[] }) {
  const [name, setName] = useState("");
  const [role, setRoleState] = useState("");
  const [dft, setDft] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => { setName(getAdminName()); setRoleState(getRole()); setDft(getDefaultBrand()); }, []);

  async function save() {
    setAdminName(name); setRole(role); setDefaultBrand(dft);
    if (name.trim()) {
      try { await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, role }) }); } catch {}
    }
    setMsg("บันทึกโปรไฟล์แล้ว"); setTimeout(() => setMsg(""), 2500);
  }

  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const inp = "bg-white border border-line rounded-lg px-3 py-2 text-sm w-full";

  return (
    <div className="flex gap-4 items-start max-[640px]:flex-col">
      <div className="w-14 h-14 rounded-full bg-cc text-white flex items-center justify-center text-xl font-bold flex-none">{initial}</div>
      <div className="flex-1 grid grid-cols-3 gap-3 max-[640px]:grid-cols-1 w-full">
        <label className="text-[12px] text-muted">ชื่อของคุณ
          <input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น แอดมินเอ" />
        </label>
        <label className="text-[12px] text-muted">บทบาท
          <input className={inp} value={role} onChange={(e) => setRoleState(e.target.value)} placeholder="เช่น CS / หัวหน้าทีม" />
        </label>
        <label className="text-[12px] text-muted">แบรนด์เริ่มต้น (ค่าตั้งต้นในหน้าจัดการด่วน)
          <select className={inp} value={dft} onChange={(e) => setDft(e.target.value)}>
            <option value="">ทุกแบรนด์ (ปกติ)</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <div className="col-span-3 max-[640px]:col-span-1 flex items-center gap-3">
          <button onClick={save} className="bg-shopee text-white px-4 py-2 rounded-lg text-sm font-semibold">บันทึกโปรไฟล์</button>
          {msg && <span className="text-pos text-sm">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
