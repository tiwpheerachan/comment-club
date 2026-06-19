"use client";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Sentiment } from "@/lib/types";

export default function SentimentChart({ sentiment }: { sentiment: Record<Sentiment, number> }) {
  const data = [
    { name: "เชิงบวก", value: sentiment.positive || 0, color: "#16a34a" },
    { name: "กลาง", value: sentiment.neutral || 0, color: "#d97706" },
    { name: "เชิงลบ", value: sentiment.negative || 0, color: "#dc2626" },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="h-[260px]">
      {total === 0 ? (
        <div className="h-full flex items-center justify-center text-muted text-sm">ไม่มีข้อมูล</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={95}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={3}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              formatter={(v) => <span style={{ color: "#1c2330", fontSize: 13 }}>{v}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
