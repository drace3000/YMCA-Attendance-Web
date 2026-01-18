"use client";

import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSelect } from "@/components/ui/popover-select";

const MONTHS: Array<{ value: string; label: string }> = [
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

function isIsoMonth(value: string): boolean {
  const v = (value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(v)) return false;
  const m = Number(v.slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12;
}

function isoMonthNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(isoMonth: string): string {
  if (!isIsoMonth(isoMonth)) return "Select month";
  const y = Number(isoMonth.slice(0, 4));
  const m = isoMonth.slice(5, 7);
  const label = MONTHS.find((x) => x.value === m)?.label ?? m;
  return `${label} ${y}`;
}

export function MonthYearPicker({
  value,
  onChange,
  ariaLabel,
  disabled,
  yearRange,
  highlightedMonths,
  className,
}: {
  value: string;
  onChange: (nextIsoMonth: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  yearRange?: { start: number; end: number };
  highlightedMonths?: string[]; // array of "YYYY-MM"
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const safeValue = useMemo(() => (isIsoMonth(value) ? value : isoMonthNow()), [value]);
  const selectedYear = useMemo(() => Number(safeValue.slice(0, 4)), [safeValue]);
  const selectedMonth = useMemo(() => safeValue.slice(5, 7), [safeValue]);

  const years = useMemo(() => {
    const nowY = new Date().getFullYear();
    const start = yearRange?.start ?? nowY - 2;
    const end = yearRange?.end ?? nowY + 10;

    const yMin = Math.min(start, end, selectedYear);
    const yMax = Math.max(start, end, selectedYear);

    const list: number[] = [];
    for (let y = yMin; y <= yMax; y += 1) list.push(y);
    return list;
  }, [selectedYear, yearRange?.end, yearRange?.start]);

  const highlightedSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of highlightedMonths ?? []) {
      if (isIsoMonth(m)) s.add(m);
    }
    return s;
  }, [highlightedMonths]);

  const canDecYear = useMemo(() => selectedYear > years[0], [selectedYear, years]);
  const canIncYear = useMemo(() => selectedYear < years[years.length - 1], [selectedYear, years]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? "Select month"}
          aria-expanded={open}
          className={cn(
            "btn-pill inline-flex min-w-[190px] items-center justify-between gap-2 rounded-lg border border-white/15 bg-card/70 px-3 py-2 text-sm shadow-sm ring-1 ring-white/10 transition hover:bg-card hover:ring-white/15 focus:outline-none focus:ring-1 focus:ring-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className="truncate">{monthLabel(safeValue)}</span>
          <span className="inline-flex items-center gap-1">
            <CalendarIcon className="h-4 w-4 text-[var(--cta)]" />
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[280px] rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-3 shadow-xl backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canDecYear}
            aria-label="Previous year"
            onClick={() => onChange(`${selectedYear - 1}-${selectedMonth}`)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <PopoverSelect
            value={String(selectedYear)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            onChange={(nextY) => onChange(`${nextY}-${selectedMonth}`)}
            ariaLabel="Year"
            className="min-w-[110px]"
            contentClassName="w-[120px]"
          />

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canIncYear}
            aria-label="Next year"
            onClick={() => onChange(`${selectedYear + 1}-${selectedMonth}`)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {MONTHS.map((m) => {
            const active = m.value === selectedMonth;
            const iso = `${selectedYear}-${m.value}`;
            const hasAvailability = highlightedSet.has(iso);
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  onChange(`${selectedYear}-${m.value}`);
                  setOpen(false);
                }}
                className={cn(
                  "rounded-lg px-2 py-2 text-xs font-semibold transition cursor-pointer",
                  active
                    ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                    : cn(
                        "border bg-black/20 text-foreground hover:bg-black/30",
                        hasAvailability ? "border-orange-400/90" : "border-white/10",
                      ),
                )}
                aria-pressed={active}
              >
                {m.label.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

