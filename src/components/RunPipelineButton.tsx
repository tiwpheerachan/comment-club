"use client";
import { useState } from "react";
import { Refresh } from "./icons";

export default function RunPipelineButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pipeline", { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMsg(
        `สำเร็จ: ดึงใหม่ ${j.fetched}, วิเคราะห์ ${j.analyzed}, ในหน้าต่าง ${j.total_in_window} — ทิศทาง ${j.direction} (${j.overall_score}), ด่วน ${j.urgent_total}`
      );
    } catch (e) {
      setMsg("ล้มเหลว: " + (e instanceof Error ? e.message : String(e)));
    }
    setBusy(false);
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 bg-shopee text-white px-4 py-2 rounded-[9px] text-sm font-semibold shadow-card hover:brightness-105 disabled:opacity-60"
      >
        <Refresh className="w-[15px] h-[15px]" />
        {busy ? "กำลังดึง+วิเคราะห์… (อาจใช้เวลาสักครู่)" : "ดึง+วิเคราะห์จาก BigQuery เดี๋ยวนี้"}
      </button>
      {msg && <div className="text-[13px] mt-2.5 text-ink">{msg}</div>}
    </div>
  );
}
