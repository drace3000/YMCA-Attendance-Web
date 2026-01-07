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
  monthsWithDataMask,
  showAllMonths = false,
}: {
  monthLabels: string[];
  series: TrendSeries[];
  monthsWithDataMask?: boolean[];
  showAllMonths?: boolean;
}) {
  // Use the global mask if provided, otherwise calculate from this series only
  const monthsToShow = monthLabels
    .map((label, i) => ({
      label,
      index: i,
      hasData: monthsWithDataMask 
        ? monthsWithDataMask[i] 
        : series.some((s) => (s.monthSessions[i] ?? 0) > 0),
    }))
    // For full year view, show all months; otherwise only months with data
    .filter((m) => showAllMonths || m.hasData);

  const data = monthsToShow.map(({ label, index }) => {
    const row: Record<string, string | number | null> = { month: label };
    for (const s of series) {
      // Use the actual average value if this class has sessions in this month
      const sessions = s.monthSessions[index] ?? 0;
      if (sessions > 0) {
        row[s.classId] = s.monthlyAvg[index];
      } else {
        // No data for this class in this month - use null (connectNulls will bridge)
        row[s.classId] = null;
      }
    }
    return row;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 10, right: 16, top: 12, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#666666" strokeOpacity={0.5} />
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
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls={true}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}




