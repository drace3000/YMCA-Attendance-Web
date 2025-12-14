"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TrendSeries = {
  classId: string;
  className: string;
  monthlyAvg: number[];
  monthSessions: number[];
  slope: number;
  delta: number;
  totalSessions: number;
};

const COLORS = ["#2563eb", "#16a34a", "#f97316", "#a855f7", "#ef4444"];

export function TrendsLineChart({
  monthLabels,
  series,
}: {
  monthLabels: string[];
  series: TrendSeries[];
}) {
  const data = monthLabels.map((label, i) => {
    const row: Record<string, string | number> = { month: label };
    for (const s of series) row[s.classId] = s.monthlyAvg[i] ?? 0;
    return row;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 10, right: 16, top: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
          <XAxis dataKey="month" tickMargin={10} />
          <YAxis tickMargin={10} />
          <Tooltip />
          <Legend />
          {series.map((s, idx) => (
            <Line
              key={s.classId}
              type="monotone"
              dataKey={s.classId}
              name={s.className}
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}



