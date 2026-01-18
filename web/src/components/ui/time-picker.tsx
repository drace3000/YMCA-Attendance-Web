"use client";

import { useMemo } from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { PopoverSelect } from "@/components/ui/popover-select";

function isHm(value: string): boolean {
  const v = (value ?? "").trim();
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const hh = Number(v.slice(0, 2));
  const mm = Number(v.slice(3, 5));
  return (
    Number.isFinite(hh) &&
    Number.isFinite(mm) &&
    hh >= 0 &&
    hh <= 23 &&
    mm >= 0 &&
    mm <= 59
  );
}

function parseHmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  if (!isHm(value)) return null;
  const hh = Number(value.slice(0, 2));
  const mm = Number(value.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function formatHm12(value: string): string {
  if (!isHm(value)) return "Select time";
  const hh = Number(value.slice(0, 2));
  const mm = value.slice(3, 5);
  const ampm = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${String(h12).padStart(2, "0")}:${mm} ${ampm}`;
}

function buildTimes(stepMinutes: number): Array<{ value: string; label: string }> {
  const step = Math.max(1, Math.floor(stepMinutes));
  const result: Array<{ value: string; label: string }> = [];
  for (let m = 0; m < 24 * 60; m += step) {
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    const value = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    result.push({ value, label: formatHm12(value) });
  }
  return result;
}

export function TimePicker({
  value,
  onChange,
  ariaLabel,
  disabled,
  stepMinutes = 15,
  minTime,
  maxTime,
  className,
}: {
  value: string;
  onChange: (nextValue: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  stepMinutes?: number;
  minTime?: string;
  maxTime?: string;
  className?: string;
}) {
  const options = useMemo(() => {
    const base = buildTimes(stepMinutes);
    const min = parseHmToMinutes(minTime);
    const max = parseHmToMinutes(maxTime);
    return base.filter((o) => {
      const m = parseHmToMinutes(o.value);
      if (m === null) return false;
      if (min !== null && m < min) return false;
      if (max !== null && m > max) return false;
      return true;
    });
  }, [maxTime, minTime, stepMinutes]);

  return (
    <PopoverSelect
      value={isHm(value) ? value : null}
      options={options.map((o) => ({
        value: o.value,
        label: o.label,
      }))}
      onChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled}
      className={cn("w-full", className)}
      contentClassName="w-[220px]"
      rightIcon={<Clock className="h-4 w-4" />}
    />
  );
}

