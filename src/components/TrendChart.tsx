"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/types";

export default function TrendChart({
  trend,
  brand,
}: {
  trend: TrendPoint[];
  brand: string;
}) {
  const data = trend.map((t) => ({
    date: t.date.slice(5),
    score: brand === "__all__" ? t.overall_score : (t.brands?.[brand] ?? null),
  }));

  return (
    <div className="h-[260px]">
      {data.length === 0 ? (
        <div className="h-full flex items-center justify-center text-muted text-sm">
          ยังไม่มีข้อมูลเทรนด์
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ee4d2d" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#ee4d2d" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef0f3" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#9aa1ad", fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis
              domain={[-100, 100]}
              tick={{ fill: "#9aa1ad", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(v: number | string) => [v, "คะแนนทิศทาง"]}
              contentStyle={{ borderRadius: 10, border: "1px solid #e6e8ec", fontSize: 13 }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#ee4d2d"
              strokeWidth={2}
              fill="url(#trendGrad)"
              connectNulls
              dot={{ r: 2, fill: "#ee4d2d" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
