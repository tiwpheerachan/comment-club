import { existsSync } from "node:fs";
import { resolve } from "node:path";
import PageHeader from "@/components/PageHeader";
import ProfileSettings from "@/components/ProfileSettings";
import RunPipelineButton from "@/components/RunPipelineButton";
import { NoAccess } from "@/components/common";
import { getCurrentProfile } from "@/lib/auth";
import { AI, BIGQUERY, COLUMNS, PIPELINE, URGENT_RULES } from "@/lib/config";
import { getActivity, getDistinct, getRuns, getTeam } from "@/lib/db";
import { canAccess } from "@/lib/pages";
import { hasSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`w-2.5 h-2.5 rounded-full flex-none ${ok ? "bg-pos" : "bg-neg"}`} />
      <div className="text-sm">
        <b>{label}</b> <span className="text-muted">— {detail}</span>
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  if (!canAccess(await getCurrentProfile(), "settings")) return <NoAccess />;
  const supabaseOk = hasSupabase();
  const bqCreds =
    Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
    existsSync(resolve(process.cwd(), "service-account.json"));
  const anthropicOk = Boolean(process.env.ANTHROPIC_API_KEY);

  const [runs, team, activity, distinct] = supabaseOk
    ? await Promise.all([getRuns(10), getTeam(), getActivity(40), getDistinct()])
    : [[], [], [], { brands: [], categories: [] }];

  return (
    <>
      <PageHeader title="ตั้งค่า" subtitle="โปรไฟล์ & ทีม • การเชื่อมต่อ • mapping • กิจกรรม" />
      <div className="px-7 pt-6 pb-16 max-w-[1100px] space-y-4">
        {/* profile */}
        <div className="card card-pad">
          <h3 className="kpi-label mb-3">โปรไฟล์ของฉัน</h3>
          <ProfileSettings brands={distinct.brands} />
        </div>

        {/* team + activity */}
        <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
          <div className="card card-pad">
            <h3 className="kpi-label mb-3">ทีม ({team.length})</h3>
            {team.length === 0 ? (
              <div className="text-muted text-sm">ยังไม่มีสมาชิก — ตั้งชื่อโปรไฟล์เพื่อเพิ่มตัวเองเข้าทีม</div>
            ) : (
              <div className="space-y-2">
                {team.map((m) => (
                  <div key={m.name} className="flex items-center gap-2.5 text-sm">
                    <span className="w-7 h-7 rounded-full bg-cc/15 text-cc flex items-center justify-center text-xs font-bold flex-none">{m.name.charAt(0).toUpperCase()}</span>
                    <span className="font-medium">{m.name}</span>
                    {m.role && <span className="text-muted text-xs">· {m.role}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card card-pad">
            <h3 className="kpi-label mb-3">กิจกรรมล่าสุด (ใครทำอะไร)</h3>
            {activity.length === 0 ? (
              <div className="text-muted text-sm">ยังไม่มีกิจกรรม</div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1 text-[13px]">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 border-b border-[#eef0f3] last:border-0 pb-1.5">
                    <span className="font-semibold text-ink">{a.actor || "ไม่ระบุ"}</span>
                    <span className="text-muted">{a.action}</span>
                    {a.detail && <span className="text-muted truncate">{a.detail}</span>}
                    <span className="text-muted text-[11px] ml-auto whitespace-nowrap">{new Date(a.created_at).toLocaleString("th-TH")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* connection */}
        <div className="card card-pad">
          <h3 className="kpi-label mb-2">สถานะการเชื่อมต่อ</h3>
          <Status ok={supabaseOk} label="Supabase" detail={supabaseOk ? "เชื่อมแล้ว" : "ยังไม่ตั้งค่า NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"} />
          <Status ok={bqCreds} label="BigQuery credentials" detail={bqCreds ? "พบ service account" : "วาง service-account.json ที่รากโปรเจกต์ หรือใส่ GOOGLE_APPLICATION_CREDENTIALS"} />
          <Status ok={anthropicOk} label="Anthropic API" detail={anthropicOk ? "พบ API key" : "ยังไม่ตั้ง ANTHROPIC_API_KEY (จะใช้ rule-based แทน)"} />
          <div className="mt-4 pt-4 border-t border-line">
            <RunPipelineButton />
          </div>
        </div>

        {/* mapping */}
        <div className="card card-pad">
          <h3 className="kpi-label mb-3">
            Mapping คอลัมน์ — BigQuery: {BIGQUERY.projectId}.{BIGQUERY.dataset}.{BIGQUERY.table}
          </h3>
          <p className="text-muted text-[13px] mb-3">
            แก้ค่าฝั่งขวาใน <code className="bg-gray-100 px-1 rounded">src/lib/config.ts</code> ให้ตรงกับชื่อคอลัมน์จริง
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[13px]">
            {Object.entries(COLUMNS).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-[#eef0f3] py-1">
                <span className="text-muted">{k}</span>
                <code className={v ? "text-ink" : "text-neg"}>{v ?? "(ไม่ใช้)"}</code>
              </div>
            ))}
          </div>
        </div>

        {/* rules */}
        <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
          <div className="card card-pad text-[13px]">
            <h3 className="kpi-label mb-3">เกณฑ์ความด่วน</h3>
            <div className="space-y-1.5">
              <div>ดาว ≤ <b>{URGENT_RULES.rating_threshold}</b> = เสี่ยง</div>
              <div>ความรุนแรง AI ≥ <b>{URGENT_RULES.severity_threshold}</b> = ด่วน</div>
              <div className="text-muted">
                คำอันตราย (ขึ้นด่วนเสมอ): {URGENT_RULES.hard_danger_keywords.length} • คำทั่วไป: {URGENT_RULES.soft_flag_keywords.length}
              </div>
              <div className="text-muted">รีวิวเชิงบวกจะไม่ติดธงด่วน (เว้นมีคำอันตราย)</div>
            </div>
          </div>
          <div className="card card-pad text-[13px]">
            <h3 className="kpi-label mb-3">AI &amp; Pipeline</h3>
            <div className="space-y-1.5">
              <div>โมเดล: <code>{AI.model}</code></div>
              <div>AI: <b>{AI.enabled ? "เปิด" : "ปิด (rule-based)"}</b> • batch {AI.batchSize} • maxTokens {AI.maxTokens}</div>
              <div>หน้าต่างสรุป: <b>{PIPELINE.windowDays}</b> วัน • backfill {PIPELINE.initialBackfillDays} วัน • จำกัด/รอบ {PIPELINE.maxPerRun || "ไม่จำกัด"}</div>
            </div>
          </div>
        </div>

        {/* runs */}
        <div className="card card-pad">
          <h3 className="kpi-label mb-3">ประวัติการรัน pipeline ล่าสุด</h3>
          {runs.length === 0 ? (
            <div className="text-muted text-sm">ยังไม่มีประวัติ</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-muted text-[11px] uppercase border-b border-line">
                  <th className="text-left p-2 font-semibold">เริ่ม</th>
                  <th className="text-left p-2 font-semibold">สถานะ</th>
                  <th className="text-right p-2 font-semibold">ดึงใหม่</th>
                  <th className="text-right p-2 font-semibold">วิเคราะห์</th>
                  <th className="text-left p-2 font-semibold">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const run = r as Record<string, unknown>;
                  return (
                    <tr key={String(run.id)} className="border-b border-[#eef0f3] last:border-0">
                      <td className="p-2 text-muted whitespace-nowrap">
                        {run.started_at ? new Date(String(run.started_at)).toLocaleString("th-TH") : "-"}
                      </td>
                      <td className="p-2">
                        <span className={run.status === "success" ? "text-pos" : run.status === "error" ? "text-neg" : "text-muted"}>
                          {String(run.status ?? "-")}
                        </span>
                      </td>
                      <td className="p-2 text-right">{String(run.fetched ?? 0)}</td>
                      <td className="p-2 text-right">{String(run.analyzed ?? 0)}</td>
                      <td className="p-2 text-muted max-w-[280px] truncate">{String(run.message ?? "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
