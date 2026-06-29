"use client";
import { useCallback, useEffect, useState } from "react";
import { PAGES } from "@/lib/pages";
import Avatar from "./Avatar";

interface U { id: string; email: string; name: string; role: string; allowed_brands: string[]; allowed_pages: string[]; active: boolean; avatar_url: string | null }

/** ย่อรูปฝั่ง client → data URL เล็ก (96px, jpeg) เพื่อเก็บในโปรไฟล์ */
function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่ได้"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("ไฟล์รูปไม่ถูกต้อง"));
      img.onload = () => {
        const S = 96;
        const c = document.createElement("canvas");
        c.width = S; c.height = S;
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("canvas ไม่พร้อม"));
        const scale = Math.max(S / img.width, S / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
const ROLES = [
  { v: "staff", label: "พนักงาน" },
  { v: "admin", label: "ผู้ดูแล" },
  { v: "super_admin", label: "ผู้ดูแลสูงสุด" },
];

export default function UsersAdmin({ brands }: { brands: string[] }) {
  const [users, setUsers] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  // create form
  const [nf, setNf] = useState({ email: "", password: "", name: "", role: "staff" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    setUsers(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(method: string, body: object, okMsg: string) {
    setMsg("");
    const res = await fetch("/api/admin/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg("ผิดพลาด: " + (j.error || res.status)); return false; }
    setMsg(okMsg); setTimeout(() => setMsg(""), 2500); await load(); return true;
  }

  async function create() {
    if (!nf.email || !nf.password) { setMsg("กรอกอีเมล + รหัสผ่าน"); return; }
    if (await call("POST", nf, "สร้างบัญชีแล้ว")) setNf({ email: "", password: "", name: "", role: "staff" });
  }

  const inp = "border border-line rounded-lg px-2.5 py-2 text-sm";

  return (
    <div className="px-7 pt-6 pb-16 max-w-[1100px] space-y-4">
      {msg && <div className="text-sm text-pos bg-pos-bg rounded-lg px-3 py-2">{msg}</div>}

      {/* create */}
      <div className="card card-pad">
        <h3 className="kpi-label mb-3">สร้างบัญชีพนักงานใหม่</h3>
        <div className="grid grid-cols-4 gap-2.5 max-[700px]:grid-cols-1">
          <input className={inp} placeholder="อีเมล" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
          <div className="flex gap-1.5">
            <input className={inp + " flex-1 min-w-0 font-mono"} placeholder="รหัสผ่านชั่วคราว" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} />
            <button type="button" onClick={() => setNf({ ...nf, password: genPassword() })} title="สุ่มรหัส" className="px-2.5 rounded-lg border border-line text-sm flex-none">🎲</button>
          </div>
          <input className={inp} placeholder="ชื่อ" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
          <select className={inp} value={nf.role} onChange={(e) => setNf({ ...nf, role: e.target.value })}>
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </div>
        <button onClick={create} className="bg-shopee text-white px-4 py-2 rounded-lg text-sm font-semibold mt-3">+ สร้างบัญชี</button>
      </div>

      {/* list */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted text-[11.5px] uppercase border-b border-line">
              <th className="text-left p-3 font-semibold">ผู้ใช้</th>
              <th className="text-left p-3 font-semibold">บทบาท</th>
              <th className="text-left p-3 font-semibold">สิทธิ์ (แบรนด์ / แท็บ)</th>
              <th className="text-left p-3 font-semibold">สถานะ</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-8 text-center text-muted">กำลังโหลด…</td></tr>
            ) : users.map((u) => (
              <RowGroup key={u.id} u={u} brands={brands} open={openId === u.id} onToggle={() => setOpenId(openId === u.id ? null : u.id)} call={call} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted">สิทธิ์ดูแบรนด์ว่าง = เห็นทุกแบรนด์ • ผู้ดูแล/ผู้ดูแลสูงสุด เห็นทุกแบรนด์เสมอ</p>
    </div>
  );
}

function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(12);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}

function RowGroup({ u, brands, open, onToggle, call }: { u: U; brands: string[]; open: boolean; onToggle: () => void; call: (m: string, b: object, ok: string) => Promise<boolean> }) {
  const [name, setName] = useState(u.name || "");
  const [role, setRole] = useState(u.role);
  const [sel, setSel] = useState<string[]>(u.allowed_brands || []);
  const [pages, setPages] = useState<string[]>(u.allowed_pages || []);
  const [pw, setPw] = useState("");
  const [copied, setCopied] = useState("");
  const copy = (text: string, what: string) => { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1500); };
  const roleLabel = ROLES.find((r) => r.v === u.role)?.label || u.role;
  const fullAccess = u.role === "super_admin" || u.role === "admin" || (u.allowed_brands || []).length === 0;
  const fullPages = u.role === "super_admin" || u.role === "admin" || (u.allowed_pages || []).length === 0;

  const toggleBrand = (b: string) => setSel((s) => (s.includes(b) ? s.filter((x) => x !== b) : [...s, b]));
  const togglePage = (p: string) => setPages((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]));

  return (
    <>
      <tr className="border-b border-[#eef0f3]">
        <td className="p-3"><div className="flex items-center gap-2.5"><Avatar src={u.avatar_url} name={u.name} size={36} /><div><div className="font-medium">{u.name || "-"}</div><div className="text-muted text-xs">{u.email}</div></div></div></td>
        <td className="p-3">{roleLabel}</td>
        <td className="p-3 text-muted text-xs">
          <div>แบรนด์: {fullAccess ? "ทุกแบรนด์" : (u.allowed_brands || []).join(", ")}</div>
          <div>แท็บ: {fullPages ? "ทุกแท็บ" : `${(u.allowed_pages || []).length} แท็บ`}</div>
        </td>
        <td className="p-3">{u.active ? <span className="text-pos">ใช้งาน</span> : <span className="text-neg">ปิด</span>}</td>
        <td className="p-3 text-right"><button onClick={onToggle} className="text-shopee text-xs font-semibold">{open ? "ปิด" : "จัดการ"}</button></td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60"><td colSpan={5} className="p-4">
          {/* รูปโปรไฟล์ + ชื่อ + อีเมล + บทบาท */}
          <div className="flex flex-wrap items-start gap-5">
            <div>
              <div className="text-[12px] text-muted mb-1">รูปโปรไฟล์</div>
              <div className="flex items-center gap-2.5">
                <Avatar src={u.avatar_url} name={u.name} size={52} />
                <div className="flex flex-col gap-1 text-left">
                  <label className="text-[12px] text-shopee font-semibold cursor-pointer">
                    {u.avatar_url ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { const url = await fileToAvatar(f); await call("PATCH", { id: u.id, avatar_url: url }, "อัปเดตรูปแล้ว"); } catch { alert("อัปโหลดรูปไม่สำเร็จ"); } } e.target.value = ""; }} />
                  </label>
                  {u.avatar_url && <button onClick={() => call("PATCH", { id: u.id, avatar_url: null }, "ลบรูปแล้ว")} className="text-[12px] text-neg text-left">ลบรูป</button>}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[12px] text-muted mb-1">ชื่อพนักงาน</div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อ-สกุล" className="border border-line rounded-lg px-2.5 py-1.5 text-sm w-52" />
            </div>
            <div>
              <div className="text-[12px] text-muted mb-1">อีเมล (ใช้เข้าสู่ระบบ)</div>
              <div className="flex items-center gap-2 border border-line rounded-lg px-2.5 py-1.5 bg-white">
                <span className="text-sm text-ink font-medium select-all">{u.email}</span>
                <button onClick={() => copy(u.email, "email")} className="text-shopee text-[11.5px] font-semibold">{copied === "email" ? "คัดลอกแล้ว ✓" : "คัดลอก"}</button>
              </div>
            </div>
            <div>
              <div className="text-[12px] text-muted mb-1">บทบาท</div>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="border border-line rounded-lg px-2.5 py-1.5 text-sm">
                {ROLES.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="text-[12px] text-muted mb-1">สิทธิ์ดูแบรนด์ (ว่าง = ทุกแบรนด์)</div>
              <div className="flex flex-wrap gap-1.5">
                {brands.map((b) => (
                  <button key={b} onClick={() => toggleBrand(b)} className={`text-[12px] px-2.5 py-1 rounded-full border ${sel.includes(b) ? "bg-shopee text-white border-shopee" : "bg-white border-line"}`}>{b}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-[12px] text-muted mb-1">สิทธิ์เข้าถึงแท็บ (ว่าง = เข้าทุกแท็บ)</div>
            <div className="flex flex-wrap gap-1.5">
              {PAGES.map((p) => (
                <button key={p.key} onClick={() => togglePage(p.key)} className={`text-[12px] px-2.5 py-1 rounded-full border ${pages.includes(p.key) ? "bg-cc text-white border-cc" : "bg-white border-line"}`}>{p.label}</button>
              ))}
            </div>
          </div>

          {/* รหัสผ่าน — ดูค่าเดิมไม่ได้ (เข้ารหัสไว้) ตั้งใหม่แล้วคัดลอกให้พนักงาน */}
          <div className="mt-3.5 p-3 rounded-xl bg-white border border-line">
            <div className="text-[12px] text-ink font-semibold mb-1.5">รหัสผ่าน <span className="text-muted font-normal">— ดูรหัสเดิมไม่ได้ (ระบบเข้ารหัสไว้เพื่อความปลอดภัย) ตั้งรหัสใหม่แล้วคัดลอกให้พนักงาน</span></div>
            <div className="flex items-center gap-2 flex-wrap">
              <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="พิมพ์รหัสใหม่ หรือกดสุ่ม" className="border border-line rounded-lg px-2.5 py-1.5 text-sm w-56 font-mono" />
              <button onClick={() => setPw(genPassword())} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-line">🎲 สุ่มรหัส</button>
              {pw && <button onClick={() => copy(pw, "pw")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-line text-shopee">{copied === "pw" ? "คัดลอกแล้ว ✓" : "คัดลอก"}</button>}
              <button disabled={pw.length < 6} onClick={async () => { if (await call("PATCH", { id: u.id, password: pw }, "ตั้งรหัสผ่านใหม่แล้ว")) { /* คงค่าไว้ให้คัดลอก */ } }} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cc text-white disabled:opacity-40">ตั้งรหัสใหม่</button>
              {pw.length > 0 && pw.length < 6 && <span className="text-[11px] text-neg">อย่างน้อย 6 ตัวอักษร</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button onClick={() => call("PATCH", { id: u.id, name: name.trim() || u.email, role, allowed_brands: sel, allowed_pages: pages }, "บันทึกแล้ว")} className="bg-shopee text-white px-3 py-1.5 rounded-lg text-xs font-semibold">บันทึกชื่อ/บทบาท/สิทธิ์</button>
            <button onClick={() => call("PATCH", { id: u.id, active: !u.active }, "เปลี่ยนสถานะแล้ว")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-line">{u.active ? "ปิดบัญชี" : "เปิดบัญชี"}</button>
            <button onClick={() => { if (confirm(`ลบบัญชี ${u.email}?`)) call("DELETE", { id: u.id }, "ลบบัญชีแล้ว"); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neg-bg text-neg ml-auto">ลบบัญชี</button>
          </div>
        </td></tr>
      )}
    </>
  );
}
