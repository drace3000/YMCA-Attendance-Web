"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, RefreshCcw, TrendingDown, TrendingUp } from "lucide-react";
import { TrendsLineChart, type TrendSeries } from "@/components/trends-line-chart";

type TrendsPayload = {
  year: number;
  months: { index: number; label: string; isoMonth: string }[];
  topUp: TrendSeries[];
  topDown: TrendSeries[];
  computedAt: string;
  meta: {
    periodStart: string;
    periodEnd: string;
    rowsInPeriod: number;
    rowsInYear?: number;
    firstDateInYear?: string | null;
    lastDateInYear?: string | null;
  };
};

type TrendMode = "up" | "down";

export default function TrendsPage() {
  const [mode, setMode] = useState<TrendMode>("up");
  const [year, setYear] = useState("2025");
  const [data, setData] = useState<TrendsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trends?year=${encodeURIComponent(year)}`, { signal });
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
  }, [year]);

  const monthLabels = useMemo(() => data?.months.map((m) => m.label) ?? [], [data]);
  const series = useMemo(() => {
    if (!data) return [];
    return mode === "up" ? data.topUp : data.topDown;
  }, [data, mode]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="rounded-3xl border border-border bg-panel-gradient p-6 shadow-sm ring-1 ring-white/10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              Trends
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
              Top classes trending {mode === "up" ? "up" : "down"} (Jan–Aug)
            </h1>
            <p className="mt-1 text-sm text-foreground/80">
              Metric is <span className="font-semibold">average attendance per month</span>{" "}
              (average headcount per session within each month).
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[140px] flex-col text-sm font-medium text-foreground">
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

            <div className="flex gap-2">
              <TogglePill
                active={mode === "up"}
                onClick={() => setMode("up")}
                icon={<TrendingUp className="h-4 w-4" />}
              >
                Trending up
              </TogglePill>
              <TogglePill
                active={mode === "down"}
                onClick={() => setMode("down")}
                icon={<TrendingDown className="h-4 w-4" />}
              >
                Trending down
              </TogglePill>
            </div>

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

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-muted px-5 py-3">
          <div className="flex items-center gap-2 text-base font-semibold">
            {mode === "up" ? (
              <ArrowUpRight className="h-5 w-5 text-[var(--cta)]" />
            ) : (
              <ArrowDownRight className="h-5 w-5 text-[var(--cta)]" />
            )}
            Line chart (top 5)
          </div>
          <div className="text-xs text-muted-foreground">
            {data?.computedAt ? `Updated: ${new Date(data.computedAt).toLocaleString()}` : ""}
          </div>
        </div>
        <div className="p-5">
          {loading && !data ? (
            <div className="text-sm text-muted-foreground">Loading trends…</div>
          ) : data ? (
            data.meta.rowsInPeriod === 0 ? (
              <div className="rounded-xl border border-white/12 bg-black/20 p-4 text-sm text-foreground/85">
                <div className="font-semibold">No Jan–Aug attendance data found.</div>
                <div className="mt-1 text-xs text-foreground/75">
                  Period: {data.meta.periodStart} → {data.meta.periodEnd}
                </div>
                {typeof data.meta.rowsInYear === "number" ? (
                  <div className="mt-1 text-xs text-foreground/75">
                    In {data.year}, the database has {data.meta.rowsInYear} session rows
                    {data.meta.firstDateInYear && data.meta.lastDateInYear
                      ? ` (${data.meta.firstDateInYear} → ${data.meta.lastDateInYear}).`
                      : "."}
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-foreground/75">
                  If you expected data here, confirm your `class_sessions.session_date` rows exist for
                  Jan–Aug in this year.
                </div>
              </div>
            ) : (
              <TrendsLineChart monthLabels={monthLabels} series={series} />
            )
          ) : (
            <div className="text-sm text-muted-foreground">No data yet.</div>
          )}
        </div>
      </section>

      {data ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <TrendTable title="Trending up (top 5)" tone="up" items={data.topUp} />
          <TrendTable title="Trending down (top 5)" tone="down" items={data.topDown} />
        </section>
      ) : null}
    </div>
  );
}

function TogglePill({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-pill inline-flex items-center gap-2 border px-4 py-2 text-sm font-semibold shadow-sm transition ${
        active
          ? "border-white/20 bg-black/25 text-white ring-1 ring-white/10"
          : "border-white/12 bg-black/15 text-foreground/90 hover:bg-black/25"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function TrendTable({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "up" | "down";
  items: TrendSeries[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 rounded-t-2xl bg-muted px-5 py-3">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">Slope + Δ (Aug − Jan)</div>
      </div>
      <div className="p-5">
        <div className="report-scroll overflow-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Class</th>
                <th className="px-4 py-2 text-right font-semibold">Slope</th>
                <th className="px-4 py-2 text-right font-semibold">Δ</th>
                <th className="px-4 py-2 text-right font-semibold">Sessions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((r) => (
                <tr key={r.classId} className="hover:bg-muted/50">
                  <td className="px-4 py-2 text-foreground">{r.className}</td>
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
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {r.totalSessions}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={4}>
                    No qualifying classes found (needs Jan and Aug data).
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


