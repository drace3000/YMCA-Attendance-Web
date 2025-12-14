"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  Hash,
  PieChart,
  RotateCcw,
} from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IgrCombo } from "igniteui-react";
import type { IgrCombo as IgrComboElement } from "igniteui-react";

type FilterState = {
  year: string;
  quarter: string;
  month: string;
  week: string;
  day: string;
  instructor: string;
};

const years = ["2025", "2024"];
const quarters = [
  { value: "all", label: "All quarters" },
  { value: "1", label: "Q1" },
  { value: "2", label: "Q2" },
  { value: "3", label: "Q3" },
  { value: "4", label: "Q4" },
];
type MonthOption = { value: string; label: string };

const months: MonthOption[] = [
  { value: "all", label: "All months" },
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const monthComboOptions = months.filter((m) => m.value !== "all");

type ComboChangeDetail = {
  newValue?: unknown[];
  items?: unknown[];
};

function isMonthOption(v: unknown): v is MonthOption {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.value === "string" && typeof obj.label === "string";
}

function installSelectAllOnValueClick(el: IgrComboElement | null) {
  if (!el) return () => {};

  const handler = () => {
    // Wait for focus to land, then select text if the native-input is focused.
    requestAnimationFrame(() => {
      const root = el.shadowRoot;
      if (!root) return;

      const nativeInput = root.querySelector(
        'input[part~="native-input"]',
      ) as HTMLInputElement | null;

      if (!nativeInput) return;
      if (root.activeElement !== nativeInput) return;

      nativeInput.select();
    });
  };

  el.addEventListener("pointerdown", handler, { passive: true });
  return () => el.removeEventListener("pointerdown", handler);
}
const weeks = [
  { value: "all", label: "All weeks" },
  ...Array.from({ length: 53 }, (_, i) => {
    const w = String(i + 1).padStart(2, "0");
    return { value: w, label: `Week ${w}` };
  }),
];
const days = [
  { value: "all", label: "All days" },
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
];

type ReportsData = {
  monthTotals: {
    totalAttendance: number;
    overallAvg: number;
    sessionsWithHeadcount: number;
    locationAverages: { location: string; avg: number; sessions: number }[];
  };
  dayTotals: {
    perDay: { day: string; total: number; avg: number; sessions: number }[];
    total: number;
    overallAvg: number;
  };
  saturdayAverages: {
    locations: { location: string; avg: number; sessions: number }[];
    totalClassAvg: number;
  };
  sundayAverages: {
    locations: { location: string; avg: number; sessions: number }[];
    totalClassAvg: number;
  };
  monthClassTypeAverage: { name: string; avg: number }[];
  monthClassGroupAverage: { group: string; avg: number }[];
  weekTotals: { label: string; total: number }[];
};

type InstructorOption = { id: string; display_name: string };

export default function ReportsPage() {
  const [resetPopoverOpen, setResetPopoverOpen] = useState(false);
  const monthComboRef = useRef<IgrComboElement | null>(null);
  const instructorComboRef = useRef<IgrComboElement | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    year: "2025",
    quarter: "all",
    month: "all",
    week: "all",
    day: "all",
    instructor: "all",
  });

  useEffect(() => {
    const cleanupMonth = installSelectAllOnValueClick(monthComboRef.current);
    const cleanupInstructor = installSelectAllOnValueClick(instructorComboRef.current);

    return () => {
      cleanupMonth();
      cleanupInstructor();
    };
  }, []);

  const [instructors, setInstructors] = useState<InstructorOption[]>([
    { id: "all", display_name: "All instructors" },
  ]);

  const [data, setData] = useState<ReportsData>({
    monthTotals: {
      totalAttendance: 0,
      overallAvg: 0,
      sessionsWithHeadcount: 0,
      locationAverages: [],
    },
    dayTotals: { perDay: [], total: 0, overallAvg: 0 },
    saturdayAverages: { locations: [], totalClassAvg: 0 },
    sundayAverages: { locations: [], totalClassAvg: 0 },
    monthClassTypeAverage: [],
    monthClassGroupAverage: [],
    weekTotals: [],
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const refreshReports = useCallback(
    async (signal?: AbortSignal) => {
      setIsRefreshing(true);
      setRefreshError(null);

      try {
        const params = new URLSearchParams({
          year: filters.year,
          quarter: filters.quarter,
          month: filters.month,
          week: filters.week,
          day: filters.day,
          instructor: filters.instructor,
        });
        const res = await fetch(`/api/reports?${params.toString()}`, { signal });
        if (!res.ok) {
          throw new Error(`Refresh failed (${res.status})`);
        }
        const payload: ReportsData = await res.json();
        if (signal?.aborted) return;

        setData(payload);
        setLastUpdatedAt(new Date());
      } catch (e) {
        if (signal?.aborted) return;
        setRefreshError(e instanceof Error ? e.message : "Failed to refresh reports");
      } finally {
        if (signal?.aborted) return;
        setIsRefreshing(false);
      }
    },
    // Any filter change should refresh all report sections.
    [filters],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/instructors");
        if (!res.ok) return;
        const data: InstructorOption[] = await res.json();
        if (!Array.isArray(data) || data.length === 0) return;
        const withAll = data.some((d) => d.id === "all")
          ? data
          : [{ id: "all", display_name: "All instructors" }, ...data];
        setInstructors(withAll);
      } catch {
        // ignore
      }
    };
    void load();
  }, []);

  // Auto-refresh when Month/Day (or Year) changes.
  useEffect(() => {
    const controller = new AbortController();
    void refreshReports(controller.signal);
    return () => controller.abort();
  }, [refreshReports]);


  const monthTotals = useMemo(() => data.monthTotals, [data.monthTotals]);
  const dayTotals = useMemo(() => data.dayTotals, [data.dayTotals]);
  const saturdayAverages = useMemo(() => data.saturdayAverages, [data.saturdayAverages]);
  const sundayAverages = useMemo(() => data.sundayAverages, [data.sundayAverages]);
  const monthClassTypeAverage = useMemo(
    () => data.monthClassTypeAverage,
    [data.monthClassTypeAverage],
  );
  const monthClassGroupAverage = useMemo(
    () => data.monthClassGroupAverage,
    [data.monthClassGroupAverage],
  );
  const weekTotals = useMemo(() => data.weekTotals, [data.weekTotals]);

  const instructorComboOptions = useMemo(
    () => instructors.filter((i) => i.id !== "all"),
    [instructors],
  );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Reports
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Attendance Insights
            </h1>
            <span className="rounded-full bg-[var(--brand-soft)]/30 px-3 py-1 text-xs font-semibold text-[var(--brand-strong)]">
              Live
            </span>
            <Popover open={resetPopoverOpen} onOpenChange={setResetPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Reset filters to all"
                  className="btn-pill inline-flex h-8 w-8 items-center justify-center bg-[var(--cta)] text-[var(--cta-foreground)] shadow-sm ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-px active:scale-[0.98]"
                  onMouseEnter={() => setResetPopoverOpen(true)}
                  onMouseLeave={() => setResetPopoverOpen(false)}
                  onFocus={() => setResetPopoverOpen(true)}
                  onBlur={() => setResetPopoverOpen(false)}
                  onClick={() => {
                    setFilters((f) => ({
                      ...f,
                      quarter: "all",
                      month: "all",
                      week: "all",
                      day: "all",
                      instructor: "all",
                    }));
                    setResetPopoverOpen(false);
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="center"
                sideOffset={8}
                className="w-auto rounded-2xl border-[var(--brand-strong)] bg-[rgb(var(--brand-soft-rgb)/0.35)] px-3 py-2 text-xs text-foreground shadow-lg backdrop-blur-md"
                onMouseEnter={() => setResetPopoverOpen(true)}
                onMouseLeave={() => setResetPopoverOpen(false)}
              >
                <PopoverArrow
                  width={12}
                  height={8}
                  className="fill-[rgb(var(--brand-soft-rgb)/0.35)] stroke-[var(--brand-strong)] stroke-1"
                />
                Reset filters to all
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-sm text-muted-foreground">
            Filter by year + quarter/month/week and day to view totals and averages.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select
            label={
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Year
              </span>
            }
            value={filters.year}
            onChange={(year) => setFilters((f) => ({ ...f, year }))}
            options={years.map((y) => ({ value: y, label: y }))}
            typeahead={false}
          />
          <Select
            label={
              <span className="inline-flex items-center gap-2">
                <CalendarRange className="h-4 w-4" /> Quarter
              </span>
            }
            value={filters.quarter}
            onChange={(quarter) =>
              setFilters((f) => ({
                ...f,
                quarter,
                month: "all",
                week: "all",
                day: "all",
              }))
            }
            options={quarters}
          />
          <label className="flex w-[196px] flex-none min-w-0 flex-col text-sm font-medium text-foreground">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Month
            </span>
            <IgrCombo
              className="ymca-ig-combo mt-1 text-sm"
              data={monthComboOptions}
              valueKey="value"
              displayKey="label"
              outlined={false}
              singleSelect={true}
              disableFiltering={false}
              placeholder="All months"
              filteringOptions={{ filterKey: "label", caseSensitive: false }}
              value={filters.month === "all" ? [] : [filters.month]}
              ref={monthComboRef}
              onChange={(ev) => {
                const detail = (
                  (ev as unknown as CustomEvent<ComboChangeDetail>).detail ??
                  // Safety: some React setups may provide the CustomEvent under nativeEvent.
                  ((ev as unknown as { nativeEvent?: { detail?: unknown } }).nativeEvent?.detail as
                    | ComboChangeDetail
                    | undefined)
                );

                const newValue = detail?.newValue ?? [];
                const firstValue = newValue.length ? newValue[0] : undefined;
                const monthFromValue = isMonthOption(firstValue)
                  ? firstValue.value
                  : typeof firstValue === "string"
                    ? firstValue
                    : undefined;

                const month = typeof monthFromValue === "string" ? monthFromValue : "all";

                setFilters((f) => ({
                  ...f,
                  month,
                  quarter: "all",
                  week: "all",
                  // Day-of-week is intended to pair with a specific month.
                  day: month === "all" ? "all" : f.day,
                }));

                // Close immediately after a selection (single-select UX).
                queueMicrotask(() => {
                  const el = monthComboRef.current;
                  if (!el) return;
                  void el.hide();
                });
              }}
            />
          </label>
          <Select
            label={
              <span className="inline-flex items-center gap-2">
                <Hash className="h-4 w-4" /> Week
              </span>
            }
            value={filters.week}
            onChange={(week) =>
              setFilters((f) => ({
                ...f,
                week,
                quarter: "all",
                month: "all",
                day: "all",
              }))
            }
            options={weeks}
          />
          <Select
            label={
              <span className="inline-flex items-center gap-2">
                <PieChart className="h-4 w-4" /> Day
              </span>
            }
            value={filters.day}
            onChange={(day) => setFilters((f) => ({ ...f, day }))}
            options={days}
          />
          <label className="flex w-[181px] flex-none min-w-0 flex-col text-sm font-medium text-foreground">
            <span className="inline-flex items-center gap-2">
              <UserIcon /> Instructor
            </span>
            <IgrCombo
              className="ymca-ig-combo mt-1 text-sm"
              data={instructorComboOptions}
              valueKey="id"
              displayKey="display_name"
              outlined={false}
              singleSelect={true}
              disableFiltering={false}
              placeholder="All instructors"
              filteringOptions={{ filterKey: "display_name", caseSensitive: false }}
              value={filters.instructor === "all" ? [] : [filters.instructor]}
              ref={instructorComboRef}
              onChange={(ev) => {
                const detail = (
                  (ev as unknown as CustomEvent<ComboChangeDetail>).detail ??
                  ((ev as unknown as { nativeEvent?: { detail?: unknown } }).nativeEvent?.detail as
                    | ComboChangeDetail
                    | undefined)
                );

                const newValue = detail?.newValue ?? [];
                const firstValue = newValue.length ? newValue[0] : undefined;
                const instructorId =
                  typeof firstValue === "string"
                    ? firstValue
                    : firstValue &&
                        typeof firstValue === "object" &&
                        "id" in (firstValue as Record<string, unknown>) &&
                        typeof (firstValue as Record<string, unknown>).id === "string"
                      ? ((firstValue as Record<string, unknown>).id as string)
                      : "all";

                setFilters((f) => ({ ...f, instructor: instructorId }));

                // Close immediately after a selection (single-select UX).
                queueMicrotask(() => {
                  const el = instructorComboRef.current;
                  if (!el) return;
                  void el.hide();
                });
              }}
            />
          </label>
          <div className="ml-auto flex items-end gap-3">
            <div className="flex flex-col justify-end pb-0.5 text-xs text-muted-foreground">
              <div>{isRefreshing ? "Updating reports…" : "Auto-refresh is on"}</div>
              <div>
                {lastUpdatedAt ? `Last updated: ${lastUpdatedAt.toLocaleString()}` : ""}
              </div>
            </div>
          </div>
        </div>
      </header>

      {refreshError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {refreshError}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <Section title="Saturday Avgs" tone="muted">
          <Table
            columns={["Location", "Avg"]}
            rows={[
              ...saturdayAverages.locations.map((r) => [
                r.location,
                r.avg.toFixed(2),
              ]),
              ["Total Class Avg", saturdayAverages.totalClassAvg.toFixed(2)],
            ]}
          />
        </Section>

        <Section title="Day Totals / Day Average" tone="muted">
          <CompactMatrix
            perDay={dayTotals.perDay}
            total={dayTotals.total}
            overallAvg={dayTotals.overallAvg}
          />
        </Section>

        <Section title="Sunday Avgs" tone="muted">
          <Table
            columns={["Location", "Avg"]}
            rows={[
              ...sundayAverages.locations.map((r) => [
                r.location,
                r.avg.toFixed(2),
              ]),
              ["Total Class Avg", sundayAverages.totalClassAvg.toFixed(2)],
            ]}
          />
        </Section>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Section title="Month Totals" tone="muted">
          <Table
            columns={["Metric", "Value"]}
            rows={[
              ["All Classes", monthTotals.totalAttendance.toString()],
              ...monthTotals.locationAverages.map((r) => [
                `${r.location} Avg`,
                r.avg.toFixed(2),
              ]),
              ["Total Class Avg", monthTotals.overallAvg.toFixed(2)],
            ]}
          />
        </Section>

        <Section title="Month Class Type Average" tone="muted">
          <Table
            columns={["Class Type", "Avg"]}
            rows={monthClassTypeAverage.map((r) => [r.name, r.avg.toFixed(2)])}
          />
        </Section>

        <div className="flex flex-col gap-4">
          <Section title="Month Class Group Average" tone="muted">
            <Table
              columns={["Group", "Avg"]}
              rows={monthClassGroupAverage.map((r) => [
                r.group,
                r.avg.toFixed(2),
              ])}
            />
          </Section>
          <Section title="Week Totals" tone="muted">
            <Table
              columns={["Week", "Total"]}
              rows={weekTotals.map((w) => [w.label, w.total.toString()])}
            />
          </Section>
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  tone = "muted",
  className = "",
  children,
}: {
  title: string;
  tone?: "primary" | "muted";
  className?: string;
  children: React.ReactNode;
}) {
  const headerClasses =
    tone === "primary"
      ? "bg-[var(--brand-gradient-strong)] text-white"
      : "bg-muted text-foreground";
  return (
    <div
      className={`flex h-full flex-col rounded-xl border border-border bg-card shadow-sm ${className}`}
    >
      <div className={`flex items-center justify-between rounded-t-xl px-4 py-2 ${headerClasses}`}>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  typeahead = true,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  typeahead?: boolean;
}) {
  const bufferRef = useRef("");
  const timeoutRef = useRef<number | null>(null);

  const resetBuffer = () => {
    bufferRef.current = "";
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  return (
    <label className="flex min-w-[140px] flex-col text-sm font-medium text-foreground">
      {label}
      <select
        className="ymca-select mt-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!typeahead) return;
          if (e.metaKey || e.ctrlKey || e.altKey) return;

          if (e.key === "Escape") {
            resetBuffer();
            return;
          }

          if (e.key === "Backspace") {
            bufferRef.current = bufferRef.current.slice(0, -1);
            return;
          }

          if (e.key.length !== 1) return;

          const ch = e.key;
          if (!ch.trim()) return;
          e.preventDefault();

          bufferRef.current = (bufferRef.current + ch).slice(0, 32);
          if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
          timeoutRef.current = window.setTimeout(() => resetBuffer(), 900);

          const q = bufferRef.current.toLowerCase();
          const matchStarts = options.find((opt) =>
            opt.label.toLowerCase().startsWith(q),
          );
          const matchContains =
            matchStarts ??
            options.find((opt) => opt.label.toLowerCase().includes(q));
          if (matchContains && matchContains.value !== value) {
            onChange(matchContains.value);
          }
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function UserIcon() {
  // Minimal inline icon (avoid importing more lucide icons if not needed).
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
    >
      <path
        d="M20 21a8 8 0 10-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 13a4 4 0 100-8 4 4 0 000 8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="report-scroll max-h-72 overflow-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/60">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="px-4 py-2 text-left font-semibold"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, idx) => (
            <tr key={idx} className="hover:bg-muted/50">
              {row.map((cell, i) => (
                <td key={i} className="px-4 py-2 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactMatrix({
  perDay,
  total,
  overallAvg,
}: {
  perDay: { day: string; total: number; avg: number; sessions: number }[];
  total: number;
  overallAvg: number;
}) {
  const days = perDay.length
    ? perDay
    : [
        { day: "MONDAY", total: 0, avg: 0, sessions: 0 },
        { day: "TUESDAY", total: 0, avg: 0, sessions: 0 },
        { day: "WEDNESDAY", total: 0, avg: 0, sessions: 0 },
        { day: "THURSDAY", total: 0, avg: 0, sessions: 0 },
        { day: "FRIDAY", total: 0, avg: 0, sessions: 0 },
        { day: "SATURDAY", total: 0, avg: 0, sessions: 0 },
        { day: "SUNDAY", total: 0, avg: 0, sessions: 0 },
      ];

  const headers = ["", ...days.map((d) => d.day.slice(0, 3)), "Total", "Avg"];
  const totalsRow = [
    "Day Totals",
    ...days.map((d) => d.total.toString()),
    total.toString(),
    overallAvg.toFixed(2),
  ];
  const avgRow = [
    "Day Average",
    ...days.map((d) => d.avg.toFixed(2)),
    "",
    overallAvg.toFixed(2),
  ];

  return (
    <div className="report-scroll overflow-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/60">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {[totalsRow, avgRow].map((row, idx) => (
            <tr key={idx} className="hover:bg-muted/50">
              {row.map((cell, i) => (
                <td key={i} className="px-3 py-2 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
