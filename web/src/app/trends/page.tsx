"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";
import { TrendsLineChart, type TrendSeries } from "@/components/trends-line-chart";

// Colors aligned with chart legend order
const SERIES_COLORS = ["#2563eb", "#16a34a", "#f97316", "#a855f7", "#ef4444"];

type TrendsPayload = {
  year: number;
  quarter?: number;
  month?: number;
  months: { index: number; label: string; isoMonth: string }[];
  topUp: TrendSeries[];
  topDown: TrendSeries[];
  computedAt: string;
  meta: {
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    rowsInPeriod: number;
    rowsInYear?: number;
    firstDateInYear?: string | null;
    lastDateInYear?: string | null;
  };
};

const QUARTERS = [
  { value: "", label: "All Quarters" },
  { value: "1", label: "Q1 (Jan–Mar)" },
  { value: "2", label: "Q2 (Apr–Jun)" },
  { value: "3", label: "Q3 (Jul–Sep)" },
  { value: "4", label: "Q4 (Oct–Dec)" },
];

export default function TrendsPage() {
  const [year, setYear] = useState("2025");
  const [quarter, setQuarter] = useState("");
  const [data, setData] = useState<TrendsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year });
      if (quarter) params.set("quarter", quarter);
      const res = await fetch(`/api/trends?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`Failed to load trends (${res.status})`);
      const payload: TrendsPayload = await res.json();
      if (signal?.aborted) return;
      setData(payload);
    } catch (e) {
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : "Failed to load trends");
    } finally {
      if (signal?.aborted) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, quarter]);

  // Quarter selector
  const handleQuarterChange = (value: string) => {
    setQuarter(value);
  };

  const monthLabels = useMemo(() => data?.months.map((m) => m.label) ?? [], [data]);
  const periodLabel = data?.meta.periodLabel ?? `${year}`;
  
  // Show all months on x-axis for full year view (no quarter selected)
  const isFullYear = !quarter;

  // Calculate which months have data across ALL series (both topUp and topDown)
  // This ensures both charts use the same x-axis
  const monthsWithDataMask = useMemo(() => {
    if (!data) return [];
    const allSeries = [...data.topUp, ...data.topDown];
    return monthLabels.map((_, i) => 
      allSeries.some((s) => (s.monthSessions[i] ?? 0) > 0)
    );
  }, [data, monthLabels]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="rounded-3xl border border-border bg-panel-gradient p-6 shadow-sm ring-1 ring-white/10">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              Trends
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
              Class Attendance Trends
            </h1>
            <p className="mt-1 text-sm text-foreground/80">
              <span className="font-semibold">{periodLabel}</span> — Metric is{" "}
              <span className="font-semibold">average attendance per month</span> (average headcount
              per session within each month).
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[100px] flex-col text-sm font-medium text-foreground">
              <span className="text-foreground/80">Year</span>
              <select
                className="ymca-select mt-1 text-sm"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                {["2025", "2024"].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[140px] flex-col text-sm font-medium text-foreground">
              <span className="text-foreground/80">Quarter</span>
              <select
                className="ymca-select mt-1 text-sm"
                value={quarter}
                onChange={(e) => handleQuarterChange(e.target.value)}
              >
                {QUARTERS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="btn-pill inline-flex items-center gap-2 border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-black/30 disabled:opacity-60"
              onClick={() => {
                const controller = new AbortController();
                void load(controller.signal);
              }}
              disabled={loading}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {/* Side-by-side charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Trending Up Chart */}
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-muted px-5 py-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
              Top 5 Trending Up
            </div>
          </div>
          <div className="p-5">
            {loading && !data ? (
              <div className="text-sm text-muted-foreground">Loading trends…</div>
            ) : data ? (
              data.topUp.length === 0 ? (
                <NoDataMessage data={data} />
              ) : (
                <TrendsLineChart monthLabels={monthLabels} series={data.topUp} monthsWithDataMask={monthsWithDataMask} showAllMonths={isFullYear} />
              )
            ) : (
              <div className="text-sm text-muted-foreground">No data yet.</div>
            )}
          </div>
        </div>

        {/* Trending Down Chart */}
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-muted px-5 py-3">
            <div className="flex items-center gap-2 text-base font-semibold">
              <TrendingDown className="h-5 w-5 text-rose-400" />
              Top 5 Trending Down
            </div>
          </div>
          <div className="p-5">
            {loading && !data ? (
              <div className="text-sm text-muted-foreground">Loading trends…</div>
            ) : data ? (
              data.topDown.length === 0 ? (
                <NoDataMessage data={data} />
              ) : (
                <TrendsLineChart monthLabels={monthLabels} series={data.topDown} monthsWithDataMask={monthsWithDataMask} showAllMonths={isFullYear} />
              )
            ) : (
              <div className="text-sm text-muted-foreground">No data yet.</div>
            )}
          </div>
        </div>
      </section>

      {/* Updated timestamp */}
      {data?.computedAt && (
        <div className="text-center text-xs text-muted-foreground">
          Data computed: {new Date(data.computedAt).toLocaleString()}
        </div>
      )}

      {data ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <TrendTable title="Trending up (top 5)" tone="up" items={data.topUp} periodLabel={periodLabel} />
          <TrendTable title="Trending down (top 5)" tone="down" items={data.topDown} periodLabel={periodLabel} />
        </section>
      ) : null}
    </div>
  );
}

function NoDataMessage({ data }: { data: TrendsPayload }) {
  return (
    <div className="rounded-xl border border-white/12 bg-black/20 p-4 text-sm text-foreground/85">
      <div className="font-semibold">No qualifying classes found for this period.</div>
      <div className="mt-1 text-xs text-foreground/75">
        Period: {data.meta.periodStart} → {data.meta.periodEnd}
      </div>
      {data.meta.rowsInPeriod > 0 && (
        <div className="mt-1 text-xs text-foreground/75">
          {data.meta.rowsInPeriod} session rows found, but none met trend criteria.
        </div>
      )}
      {typeof data.meta.rowsInYear === "number" && data.meta.rowsInPeriod === 0 && (
        <div className="mt-1 text-xs text-foreground/75">
          In {data.year}, the database has {data.meta.rowsInYear} session rows
          {data.meta.firstDateInYear && data.meta.lastDateInYear
            ? ` (${data.meta.firstDateInYear} → ${data.meta.lastDateInYear}).`
            : "."}
        </div>
      )}
    </div>
  );
}

function TrendTable({
  title,
  tone,
  items,
  periodLabel,
}: {
  title: string;
  tone: "up" | "down";
  items: TrendSeries[];
  periodLabel: string;
}) {
  const InfoTooltip = ({
    label,
    tooltip,
    align = "center",
  }: {
    label: string;
    tooltip: string;
    align?: "center" | "right";
  }) => {
    const [open, setOpen] = useState(false);

    const positionClasses =
      align === "right" ? "right-0 translate-x-0" : "left-1/2 -translate-x-1/2";

    const arrowClasses =
      align === "right" ? "right-3" : "left-1/2 -translate-x-1/2";

    return (
      <span
        className="relative inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <span className="inline-flex cursor-help items-center gap-1 underline decoration-dotted decoration-white/40">
          {label}
        </span>
        {open && (
          <>
            {/* Arrow */}
            <span
              className={`absolute top-full z-50 mt-0 h-0 w-0 border-x-8 border-b-8 border-x-transparent border-b-[var(--brand-strong)] ${arrowClasses}`}
            />
            {/* Tooltip body */}
            <span
              className={`absolute top-full z-50 mt-2 w-max min-w-[200px] max-w-[320px] ${positionClasses} rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs font-normal text-foreground shadow-lg backdrop-blur-md whitespace-normal break-words text-left`}
            >
              {tooltip}
            </span>
          </>
        )}
      </span>
    );
  };

  const percentChange = (item: TrendSeries) => {
    const firstIdx = item.monthSessions.findIndex((s) => (s ?? 0) > 0);
    const lastIdx =
      item.monthSessions.length -
      1 -
      [...item.monthSessions].reverse().findIndex((s) => (s ?? 0) > 0);
    if (firstIdx < 0 || lastIdx < 0 || firstIdx >= item.monthlyAvg.length || lastIdx >= item.monthlyAvg.length) {
      return 0;
    }
    const firstVal = item.monthlyAvg[firstIdx] ?? 0;
    const lastVal = item.monthlyAvg[lastIdx] ?? 0;
    if (firstVal === 0) return 0;
    return ((lastVal - firstVal) / firstVal) * 100;
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-muted px-5 py-3">
        <div className="flex items-center gap-2 text-base font-semibold">
          {tone === "up" ? (
            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-rose-400" />
          )}
          {title}
        </div>
        <div className="text-xs text-muted-foreground">Slope + Δ (first–last)</div>
      </div>
      <div className="p-5">
        <div className="report-scroll overflow-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Class</th>
                <th className="px-4 py-2 text-right font-semibold">
                  <InfoTooltip
                    label="Slope"
                    tooltip="Trend line slope across months with data (higher is steeper uptrend; lower is steeper downtrend)."
                  />
                </th>
                <th className="px-4 py-2 text-right font-semibold">
                  <InfoTooltip
                    label="Δ"
                    tooltip="Difference between last and first month with data (last − first)."
                    align="right"
                  />
                </th>
                <th className="px-4 py-2 text-right font-semibold">
                  <InfoTooltip
                    label="%"
                    tooltip="Percent change between first and last month with data: (last − first) / first."
                    align="right"
                  />
                </th>
                <th className="px-4 py-2 text-right font-semibold">
                  <InfoTooltip
                    label="Sessions"
                    tooltip="Total session count in the selected period."
                    align="right"
                  />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((r, idx) => {
                const pct = percentChange(r);
                return (
                <tr key={r.classId} className="hover:bg-muted/50">
                  <td className="px-4 py-2 text-foreground">
                    <span style={{ color: SERIES_COLORS[idx % SERIES_COLORS.length] }}>{r.className}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-foreground">
                    {r.slope.toFixed(3)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      tone === "up" ? "text-emerald-200" : "text-rose-200"
                    }`}
                  >
                    {r.delta >= 0 ? "+" : ""}
                    {r.delta.toFixed(2)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      pct >= 0 ? "text-emerald-200" : "text-rose-200"
                    }`}
                  >
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {r.totalSessions}
                  </td>
                </tr>
              )})}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={5}>
                    No qualifying classes found for {periodLabel}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


