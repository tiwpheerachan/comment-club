"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "@/components/Logo";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      const sb = createSupabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
      if (error) {
        setErr("เข้าสู่ระบบไม่สำเร็จ — ตรวจอีเมล/รหัสผ่านอีกครั้ง");
        setLoading(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      router.push(next);
      router.refresh();
    } catch {
      setErr("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6f7f9] p-6">
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center mb-6">
          <Logo scriptSize={40} clubSize={30} animate />
        </div>
        <form onSubmit={submit} className="card card-pad space-y-3">
          <h1 className="text-[15px] font-bold text-center mb-1">เข้าสู่ระบบ</h1>
          <div>
            <label className="text-[12px] text-muted">อีเมล</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-line rounded-lg px-3 py-2.5 text-sm mt-1" placeholder="you@company.com" />
          </div>
          <div>
            <label className="text-[12px] text-muted">รหัสผ่าน</label>
            <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} className="w-full border border-line rounded-lg px-3 py-2.5 text-sm mt-1" placeholder="••••••••" />
          </div>
          {err && <div className="text-neg text-[13px] bg-neg-bg rounded-lg p-2.5">{err}</div>}
          <button type="submit" disabled={loading} className="w-full bg-shopee text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60">
            {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </button>
          <p className="text-[11.5px] text-muted text-center pt-1">บัญชีสร้างโดยผู้ดูแลระบบ (super admin) เท่านั้น</p>
        </form>
      </div>
    </div>
  );
}
