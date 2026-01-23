"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, FileText, Loader2, TrendingDown, TrendingUp, X } from "lucide-react";
import dynamic from "next/dynamic";
import { TrendsLineChart, type TrendSeries } from "@/components/trends-line-chart";
import type { TrendsReportData } from "@/components/trends-report-pdf";
import { useThemeSettings } from "@/components/theme-settings-provider";

type Branch = {
  id: string;
  name: string;
  branch_manager_name?: string | null;
  // Flat fields (current API response)
  alliance_name?: string | null;
  association_name?: string | null;
  association?: {
    name?: string | null;
    alliance?: {
      name?: string | null;
    } | null;
  } | null;
};

const GenerateTrendsReportModal = dynamic(
  () => import("@/components/trends-report-pdf/GenerateTrendsReportModal").then((mod) => mod.GenerateTrendsReportModal),
  { ssr: false }
);

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

  // PDF Export state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [chartImages, setChartImages] = useState<{ trendingUp?: string; trendingDown?: string }>({});
  const [capturingCharts, setCapturingCharts] = useState(false);
  const [chartsReady, setChartsReady] = useState(false);
  const [cancelCaptureRequested, setCancelCaptureRequested] = useState(false);
  const cancelCaptureRef = useRef(false);
  const chartUpRef = useRef<HTMLDivElement>(null);
  const chartDownRef = useRef<HTMLDivElement>(null);

  // Branch info for PDF
  const { branch } = useThemeSettings();
  const [branchDetails, setBranchDetails] = useState<Branch | null>(null);

  const toTitleCase = useCallback((value: string | null | undefined): string | null => {
    if (!value) return null;
    const lowerWords = new Set([
      "of",
      // (we can add more later if desired)
    ]);
    return value
      .split(" ")
      .filter(Boolean)
      .map((word, idx) => {
        const upper = word.toUpperCase();
        // Preserve YMCA acronym (and plural with lowercase s)
        if (upper === "YMCA") return "YMCA";
        if (upper === "YMCAS") return "YMCAs";
        const lower = word.toLowerCase();
        if (idx !== 0 && lowerWords.has(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(" ");
  }, []);

  // Fetch branch details including manager name
  useEffect(() => {
    const fetchBranchDetails = async () => {
      try {
        const res = await fetch(`/api/branches/${encodeURIComponent(branch.id)}`);
        if (res.ok) {
          const details: Branch = await res.json();
          setBranchDetails(details);
        }
      } catch {
        // Ignore fetch errors; UI already handles missing branch details.
      }
    };
    fetchBranchDetails();
  }, [branch.id]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ year });
        if (quarter) params.set("quarter", quarter);
        params.set("branch_id", branch.id);
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
    },
    [year, quarter, branch.id]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Quarter selector
  const handleQuarterChange = (value: string) => {
    setQuarter(value);
  };

  const monthLabels = useMemo(() => data?.months.map((m) => m.label) ?? [], [data]);
  const periodLabel = data?.meta.periodLabel ?? `${year}`;
  
  // Show all months on x-axis for full year view (no quarter selected)
  const isFullYear = !quarter;

  // Only enable Export PDF when BOTH charts have actually rendered (Recharts mounted)
  useEffect(() => {
    setChartsReady(false);

    if (!data || loading) return;

    let cancelled = false;
    let readyTimeout: ReturnType<typeof setTimeout> | null = null;
    let tries = 0;
    const maxTries = 60; // ~3 seconds at 50ms intervals

    const hasRenderedChart = (el: HTMLDivElement | null): boolean => {
      if (!el) return false;
      const wrapper = el.querySelector<HTMLElement>(".recharts-wrapper");
      if (!wrapper) return false;
      const rect = wrapper.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const tick = () => {
      if (cancelled) return;
      tries += 1;

      const upOk = hasRenderedChart(chartUpRef.current);
      const downOk = hasRenderedChart(chartDownRef.current);

      if (upOk && downOk) {
        // Extra delay to ensure charts fully finish rendering/animating before capture.
        readyTimeout = setTimeout(() => {
          if (cancelled) return;
          setChartsReady(true);
        }, 3000);
        return;
      }

      if (tries >= maxTries) return;
      setTimeout(tick, 50);
    };

    tick();
    return () => {
      cancelled = true;
      if (readyTimeout) clearTimeout(readyTimeout);
    };
  }, [data, loading]);

  // Calculate which months have data across ALL series (both topUp and topDown)
  // This ensures both charts use the same x-axis
  const monthsWithDataMask = useMemo(() => {
    if (!data) return [];
    const allSeries = [...data.topUp, ...data.topDown];
    return monthLabels.map((_, i) => 
      allSeries.some((s) => (s.monthSessions[i] ?? 0) > 0)
    );
  }, [data, monthLabels]);

  // Capture charts as images for PDF export
  const captureChartsAndOpenModal = useCallback(async () => {
    if (!data || !chartsReady) return;
    setCapturingCharts(true);
    setCancelCaptureRequested(false);
    cancelCaptureRef.current = false;

    try {
      // Let React paint the "Preparing PDF..." UI before starting heavy work (html2canvas can take 5–10s).
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });

      if (cancelCaptureRef.current) return;

      // Dynamically import html2canvas
      const html2canvas = (await import("html2canvas")).default;

      const images: { trendingUp?: string; trendingDown?: string } = {};

      if (chartUpRef.current) {
        const canvas = await html2canvas(chartUpRef.current, {
          backgroundColor: "#FFFFFF",
          scale: 2,
        });
        if (cancelCaptureRef.current) return;
        images.trendingUp = canvas.toDataURL("image/png");
      }

      if (chartDownRef.current) {
        const canvas = await html2canvas(chartDownRef.current, {
          backgroundColor: "#FFFFFF",
          scale: 2,
        });
        if (cancelCaptureRef.current) return;
        images.trendingDown = canvas.toDataURL("image/png");
      }

      if (cancelCaptureRef.current) return;
      setChartImages(images);
      setExportModalOpen(true);
    } catch {
      if (cancelCaptureRef.current) return;
      // Open modal anyway, will show placeholder for charts
      setExportModalOpen(true);
    } finally {
      setCapturingCharts(false);
      setCancelCaptureRequested(false);
      cancelCaptureRef.current = false;
    }
  }, [data, chartsReady]);

  // Prepare data for PDF export
  const pdfData: TrendsReportData | null = useMemo(() => {
    if (!data) return null;
    return {
      year: data.year,
      quarter: data.quarter,
      periodLabel: data.meta.periodLabel,
      periodStart: data.meta.periodStart,
      periodEnd: data.meta.periodEnd,
      topUp: data.topUp,
      topDown: data.topDown,
      computedAt: data.computedAt,
      allianceName:
        toTitleCase(branchDetails?.association?.alliance?.name ?? branchDetails?.alliance_name) ?? undefined,
      associationName:
        toTitleCase(branchDetails?.association?.name ?? branchDetails?.association_name) ?? undefined,
      branchName: toTitleCase(branchDetails?.name) || branch.name,
      branchManager: branchDetails?.branch_manager_name || undefined,
    };
  }, [data, branchDetails, branch.name, toTitleCase]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="rounded-3xl border border-border bg-panel-gradient p-6 shadow-sm ring-1 ring-white/10">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-foreground/80">
              Trends
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Class Attendance Trends
              </h1>
              {/* Export PDF Button */}
              <button
                onClick={captureChartsAndOpenModal}
                disabled={!data || loading || capturingCharts || !chartsReady}
                className="btn-pill flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {capturingCharts || (!chartsReady && !!data && !loading) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {capturingCharts
                  ? "Preparing PDF..."
                  : !data || loading
                    ? "Loading..."
                    : !chartsReady
                      ? "Loading charts..."
                      : "Export PDF"}
              </button>

              {/* Cancel option while preparing (best-effort; html2canvas cannot be forcibly aborted mid-render) */}
              {capturingCharts && (
                <button
                  type="button"
                  onClick={() => {
                    setCancelCaptureRequested(true);
                    cancelCaptureRef.current = true;
                  }}
                  disabled={cancelCaptureRequested}
                  className="btn-pill flex cursor-pointer items-center gap-2 border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  {cancelCaptureRequested ? "Cancelling..." : "Cancel"}
                </button>
              )}
            </div>
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
          <div ref={chartUpRef} className="p-5">
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
          <div ref={chartDownRef} className="p-5">
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

      {/* Export PDF Modal */}
      {pdfData && (
        <GenerateTrendsReportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          data={pdfData}
          chartImages={chartImages}
          branchId={branch.id}
        />
      )}
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


