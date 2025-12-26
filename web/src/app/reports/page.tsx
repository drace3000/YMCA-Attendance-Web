"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  FileText,
  Hash,
  PieChart,
  RotateCcw,
  Square,
  SquareCheck,
} from "lucide-react";
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { IgrCombo } from "igniteui-react";
import type { IgrCombo as IgrComboElement } from "igniteui-react";
import dynamic from "next/dynamic";
import type { ReportSection } from "@/components/attendance-report-pdf";
import { useThemeSettings } from "@/components/theme-settings-provider";

const GenerateReportModal = dynamic(
  () => import("@/components/attendance-report-pdf/GenerateReportModal").then((mod) => mod.GenerateReportModal),
  { ssr: false }
);

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

const ALL_REPORT_SECTIONS: ReportSection[] = [
  "saturdayAverages",
  "dayTotals",
  "sundayAverages",
  "monthTotals",
  "monthClassTypeAverage",
  "monthClassGroupAverage",
  "weekTotals",
];

export default function ReportsPage() {
  const { branch } = useThemeSettings();
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
  
  // PDF export state
  const [selectedSections, setSelectedSections] = useState<Set<ReportSection>>(
    new Set(ALL_REPORT_SECTIONS)
  );
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const toggleSection = (section: ReportSection) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const toggleAllSections = () => {
    if (selectedSections.size === ALL_REPORT_SECTIONS.length) {
      setSelectedSections(new Set());
    } else {
      setSelectedSections(new Set(ALL_REPORT_SECTIONS));
    }
  };

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

  // Filter months based on selected quarter
  const filteredMonths = useMemo(() => {
    if (filters.quarter === "all") {
      return monthComboOptions; // All 12 months (excluding "all" which is handled by placeholder)
    }

    const q = Number(filters.quarter);
    // Q1: Jan-Mar (01-03), Q2: Apr-Jun (04-06), Q3: Jul-Sep (07-09), Q4: Oct-Dec (10-12)
    const quarterMonthRanges: Record<number, [number, number]> = {
      1: [1, 3],
      2: [4, 6],
      3: [7, 9],
      4: [10, 12],
    };
    const [startMonth, endMonth] = quarterMonthRanges[q] || [1, 12];

    return monthComboOptions.filter((m) => {
      const mNum = Number(m.value);
      return mNum >= startMonth && mNum <= endMonth;
    });
  }, [filters.quarter]);

  // Filter weeks based on selected month (most specific) or quarter
  const filteredWeeks = useMemo(() => {
    const year = Number(filters.year);

    // Calculate ISO week number for a date
    const getIsoWeek = (date: Date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };

    // If month is selected, filter weeks by month (takes priority over quarter)
    if (filters.month !== "all") {
      const m = Number(filters.month);
      // Get first and last day of month
      const firstDay = new Date(Date.UTC(year, m - 1, 1));
      const lastDay = new Date(Date.UTC(year, m, 0));
      
      const startWeek = getIsoWeek(firstDay);
      const endWeek = getIsoWeek(lastDay);
      
      return [
        { value: "all", label: "All weeks" },
        ...weeks.slice(1).filter((w) => {
          const wNum = Number(w.value);
          return wNum >= startWeek && wNum <= endWeek;
        }),
      ];
    }

    // If only quarter is selected (no month), filter weeks by quarter
    if (filters.quarter !== "all") {
      const q = Number(filters.quarter);
      // Approximate week ranges by quarter
      const quarterWeekRanges: Record<number, [number, number]> = {
        1: [1, 13],
        2: [14, 26],
        3: [27, 39],
        4: [40, 53],
      };
      const [startWeek, endWeek] = quarterWeekRanges[q] || [1, 53];
      return [
        { value: "all", label: "All weeks" },
        ...weeks.slice(1).filter((w) => {
          const wNum = Number(w.value);
          return wNum >= startWeek && wNum <= endWeek;
        }),
      ];
    }

    // No filters - show all weeks
    return weeks;
  }, [filters.quarter, filters.month, filters.year]);

  // Show all days - don't dynamically filter based on data results
  // This prevents dropdown from flashing/collapsing when data refreshes
  const filteredDays = days;

  // Reset month/week if current value is no longer in filtered options (due to quarter change)
  useEffect(() => {
    const monthValues = filteredMonths.map((m) => m.value);
    const weekValues = filteredWeeks.map((w) => w.value);
    
    const needsMonthReset = filters.month !== "all" && !monthValues.includes(filters.month);
    const needsWeekReset = filters.week !== "all" && !weekValues.includes(filters.week);
    
    // Only update if something actually needs to change
    if (needsMonthReset || needsWeekReset) {
      setFilters((f) => ({
        ...f,
        month: needsMonthReset ? "all" : f.month,
        week: needsWeekReset ? "all" : f.week,
      }));
    }
  }, [filteredMonths, filteredWeeks, filters.month, filters.week]);

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
            
            {/* Export PDF Button */}
            <button
              onClick={() => setExportModalOpen(true)}
              disabled={selectedSections.size === 0}
              className="btn-pill flex items-center gap-2 bg-[var(--cta)] px-4 py-2 text-sm font-medium text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              Export PDF
              {selectedSections.size > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
                  {selectedSections.size}
                </span>
              )}
            </button>
            
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
              data={filteredMonths}
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

                setFilters((f) => {
                  // Skip if month hasn't actually changed (prevents unnecessary re-renders)
                  if (f.month === month) {
                    return f;
                  }
                  // Keep quarter and week as-is - useEffect will reset week if it's outside the month's range
                  return { ...f, month };
                });

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
                // Keep quarter and month as-is, only reset day
                day: "all",
              }))
            }
            options={filteredWeeks}
          />
          <Select
            label={
              <span className="inline-flex items-center gap-2">
                <PieChart className="h-4 w-4" /> Day
              </span>
            }
            value={filters.day}
            onChange={(day) => setFilters((f) => ({ ...f, day }))}
            options={filteredDays}
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

                setFilters((f) => {
                  // Skip if instructor hasn't actually changed
                  if (f.instructor === instructorId) {
                    return f;
                  }
                  return { ...f, instructor: instructorId };
                });

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

      {/* Report selection controls */}
      <div className="-my-4 flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAllSections}
          className="rounded border border-[var(--brand-strong)] bg-[var(--brand-strong)]/20 px-3 py-1 text-xs font-medium text-foreground transition hover:bg-[var(--brand-strong)]/40"
        >
          {selectedSections.size === ALL_REPORT_SECTIONS.length ? "Deselect All" : "Select All"}
        </button>
        <span className="text-sm text-muted-foreground">
          {selectedSections.size} of {ALL_REPORT_SECTIONS.length} reports selected
        </span>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Saturday Avgs"
          tone="muted"
          checked={selectedSections.has("saturdayAverages")}
          onToggle={() => toggleSection("saturdayAverages")}
        >
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

        <Section
          title="Day Totals / Day Average"
          tone="muted"
          checked={selectedSections.has("dayTotals")}
          onToggle={() => toggleSection("dayTotals")}
        >
          <CompactMatrix
            perDay={dayTotals.perDay}
            total={dayTotals.total}
            overallAvg={dayTotals.overallAvg}
          />
        </Section>

        <Section
          title="Sunday Avgs"
          tone="muted"
          checked={selectedSections.has("sundayAverages")}
          onToggle={() => toggleSection("sundayAverages")}
        >
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
        <Section
          title="Month Totals"
          tone="muted"
          checked={selectedSections.has("monthTotals")}
          onToggle={() => toggleSection("monthTotals")}
        >
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

        <Section
          title="Month Class Type Average"
          tone="muted"
          checked={selectedSections.has("monthClassTypeAverage")}
          onToggle={() => toggleSection("monthClassTypeAverage")}
        >
          <Table
            columns={["Class Type", "Avg"]}
            rows={monthClassTypeAverage.map((r) => [r.name, r.avg.toFixed(2)])}
          />
        </Section>

        <div className="flex flex-col gap-4">
          <Section
            title="Month Class Group Average"
            tone="muted"
            checked={selectedSections.has("monthClassGroupAverage")}
            onToggle={() => toggleSection("monthClassGroupAverage")}
          >
            <Table
              columns={["Group", "Avg"]}
              rows={monthClassGroupAverage.map((r) => [
                r.group,
                r.avg.toFixed(2),
              ])}
            />
          </Section>
          <Section
            title="Week Totals"
            tone="muted"
            checked={selectedSections.has("weekTotals")}
            onToggle={() => toggleSection("weekTotals")}
          >
            <Table
              columns={["Week", "Total"]}
              rows={weekTotals.map((w) => [w.label, w.total.toString()])}
            />
          </Section>
        </div>
      </section>

      {/* Export PDF Modal */}
      <GenerateReportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        data={data}
        filters={filters}
        selectedSections={Array.from(selectedSections)}
        branchId={branch?.id}
      />
    </div>
  );
}

function Section({
  title,
  tone = "muted",
  className = "",
  checked,
  onToggle,
  children,
}: {
  title: string;
  tone?: "primary" | "muted";
  className?: string;
  checked?: boolean;
  onToggle?: () => void;
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
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-6 w-6 items-center justify-center rounded transition hover:bg-white/20"
            aria-label={checked ? "Deselect for PDF export" : "Select for PDF export"}
          >
            {checked ? (
              <SquareCheck className="h-5 w-5 text-[var(--cta)] drop-shadow-[0_0_4px_var(--cta)]" />
            ) : (
              <Square className="h-5 w-5 opacity-60" />
            )}
          </button>
        )}
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
