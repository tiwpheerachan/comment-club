import Dashboard from "@/components/Dashboard";
import { getSummary, getTrend } from "@/lib/store";

// อ่านสด ๆ ทุกครั้ง (ข้อมูลมาจาก Supabase ที่ pipeline ดึงจาก BigQuery)
export const dynamic = "force-dynamic";

export default async function Page() {
  const [{ summary, configured }, trend] = await Promise.all([getSummary(), getTrend()]);

  if (!summary) {
    return (
      <div className="max-w-2xl mx-auto p-10 mt-10">
        <div className="card card-pad">
          <h1 className="text-lg font-bold mb-2">ยังไม่มีข้อมูล</h1>
          {!configured ? (
            <div className="text-muted text-sm leading-relaxed">
              ยังไม่ได้เชื่อม Supabase — ตั้งค่า <code className="bg-gray-100 px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_URL</code> และ{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded">SUPABASE_SERVICE_ROLE_KEY</code> ใน{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded">.env.local</code> แล้วรัน schema ใน{" "}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded">sql/0001_init.sql</code>
            </div>
          ) : (
            <div className="text-muted text-sm leading-relaxed">
              เชื่อม Supabase แล้ว แต่ยังไม่มี snapshot — รัน pipeline เพื่อดึงข้อมูลจาก BigQuery:
              <pre className="bg-gray-100 rounded-lg p-3 mt-2 text-xs">npm run pipeline</pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <Dashboard summary={summary} trend={trend} />;
}
