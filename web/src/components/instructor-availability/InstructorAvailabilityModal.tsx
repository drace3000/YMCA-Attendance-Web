"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotateCcw, Loader2, Plus, Trash2, X } from "lucide-react";
import { PopoverSelect } from "@/components/ui/popover-select";
import { TimePicker } from "@/components/ui/time-picker";

type AvailabilityRow = {
  id: string;
  branch_id: string;
  instructor_id: string;
  schedule_month: string; // "YYYY-MM"
  day_of_week: string; // "MONDAY"..."SUNDAY"
  available_start: string; // "HH:mm"
  available_end: string; // "HH:mm"
};

const DAYS: Array<AvailabilityRow["day_of_week"]> = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

const MONTHS: Array<{ idx: number; label: string; value: string }> = [
  { idx: 1, label: "Jan", value: "01" },
  { idx: 2, label: "Feb", value: "02" },
  { idx: 3, label: "Mar", value: "03" },
  { idx: 4, label: "Apr", value: "04" },
  { idx: 5, label: "May", value: "05" },
  { idx: 6, label: "Jun", value: "06" },
  { idx: 7, label: "Jul", value: "07" },
  { idx: 8, label: "Aug", value: "08" },
  { idx: 9, label: "Sep", value: "09" },
  { idx: 10, label: "Oct", value: "10" },
  { idx: 11, label: "Nov", value: "11" },
  { idx: 12, label: "Dec", value: "12" },
];

function getIsoMonthFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function normalizeHm(value: string): string {
  return (value || "").slice(0, 5);
}

function isHm(value: string | null | undefined): value is string {
  if (!value) return false;
  const v = value.trim();
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
  if (!isHm(value)) return null;
  const hh = Number(value.slice(0, 2));
  const mm = Number(value.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function minutesToHm(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.floor(mins)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dayLabel(day: string): string {
  const d = (day || "").toUpperCase();
  return d.slice(0, 3);
}

function rowKey(r: Pick<AvailabilityRow, "day_of_week" | "available_start" | "available_end">): string {
  return `${String(r.day_of_week).toUpperCase()}|${normalizeHm(String(r.available_start))}|${normalizeHm(
    String(r.available_end),
  )}`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function InstructorAvailabilityModal({
  isOpen,
  onClose,
  branchId,
  instructorId,
  instructorLabel,
  initialMonth,
  onUpdated,
}: {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  instructorId: string;
  instructorLabel: string;
  initialMonth?: string;
  onUpdated?: () => void;
}) {
  const [month, setMonth] = useState<string>(initialMonth ?? getIsoMonthFromDate(new Date()));
  const [allRows, setAllRows] = useState<AvailabilityRow[]>([]);
  const [draftMonthRows, setDraftMonthRows] = useState<AvailabilityRow[]>([]);
  const [draftMonth, setDraftMonth] = useState<string>(month);
  const [draftInitializedMonth, setDraftInitializedMonth] = useState<string | null>(null);
  const [hasLoadedAvailability, setHasLoadedAvailability] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDays, setSelectedDays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const d of DAYS) initial[d] = false;
    return initial;
  });
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");

  const [branchTimeStart, setBranchTimeStart] = useState<string>("06:00");
  const [branchTimeEnd, setBranchTimeEnd] = useState<string>("23:00");

  useEffect(() => {
    if (!isOpen) return;
    const nextMonth = initialMonth ?? getIsoMonthFromDate(new Date());
    setMonth(nextMonth);
    setDraftMonth(nextMonth);
    setDraftMonthRows([]); // clear any previous open's draft state to avoid false dirty prompts
    setDraftInitializedMonth(null);
    setHasLoadedAvailability(false);
  }, [isOpen, initialMonth]);

  const selectedYear = useMemo(() => Number(month.slice(0, 4)), [month]);
  const selectedMonthValue = useMemo(() => month.slice(5, 7), [month]);

  const yearOptions = useMemo(() => {
    const nowY = new Date().getFullYear();
    const years = new Set<number>([nowY - 1, nowY, nowY + 1, selectedYear]);
    for (const r of allRows) {
      const y = Number(r.schedule_month.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [allRows, selectedYear]);

  const fetchAllRows = useCallback(async () => {
    if (!branchId || !instructorId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("branch_id", branchId);
      params.set("instructor_id", instructorId);
      const res = await fetch(`/api/scheduling/instructor-availability?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Failed to load instructor availability");
      }
      const json = await res.json();
      const list = Array.isArray(json?.availability) ? (json.availability as AvailabilityRow[]) : [];
      setAllRows(
        list
          .map((r) => ({
            ...r,
            day_of_week: String(r.day_of_week).toUpperCase(),
            available_start: normalizeHm(String(r.available_start)),
            available_end: normalizeHm(String(r.available_end)),
          }))
          .filter((r) => r.branch_id && r.instructor_id && r.schedule_month),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load availability");
      setAllRows([]);
    } finally {
      setLoading(false);
      setHasLoadedAvailability(true);
    }
  }, [branchId, instructorId]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchAllRows();
  }, [isOpen, fetchAllRows]);

  // Load per-branch time range for picker limits.
  useEffect(() => {
    if (!isOpen) return;
    if (!branchId) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/branches/${branchId}`, { signal: controller.signal });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || controller.signal.aborted) return;
        const start = normalizeHm(String(json?.availability_time_start ?? "06:00"));
        const end = normalizeHm(String(json?.availability_time_end ?? "23:00"));
        setBranchTimeStart(isHm(start) ? start : "06:00");
        setBranchTimeEnd(isHm(end) ? end : "23:00");
      } catch {
        // ignore; keep defaults
      }
    };

    void load();
    return () => controller.abort();
  }, [branchId, isOpen]);

  const serverMonthRows = useMemo(() => {
    return allRows
      .filter((r) => r.schedule_month === month)
      .slice()
      .sort((a, b) => a.day_of_week.localeCompare(b.day_of_week) || a.available_start.localeCompare(b.available_start));
  }, [allRows, month]);

  const serverKeys = useMemo(() => new Set(serverMonthRows.map(rowKey)), [serverMonthRows]);
  const draftKeys = useMemo(() => new Set(draftMonthRows.map(rowKey)), [draftMonthRows]);
  const isDirty = useMemo(() => {
    if (serverKeys.size !== draftKeys.size) return true;
    for (const k of serverKeys) if (!draftKeys.has(k)) return true;
    return false;
  }, [draftKeys, serverKeys]);

  // Don't treat the modal as dirty until we've synchronized an initial draft for this month.
  const isSyncedForMonth = useMemo(() => draftInitializedMonth === month, [draftInitializedMonth, month]);
  const isDirtyEffective = useMemo(() => isSyncedForMonth && isDirty, [isDirty, isSyncedForMonth]);

  // Initialize/reset draft rows when month changes or server rows refresh (if not dirty).
  useEffect(() => {
    if (!isOpen) return;
    if (!hasLoadedAvailability) return;
    if (draftMonth !== month) {
      setDraftMonth(month);
      setDraftMonthRows(serverMonthRows);
      setDraftInitializedMonth(month);
      return;
    }
    // One-time sync for this month when server rows arrive (prevents false "dirty" while loading).
    if (draftInitializedMonth !== month) {
      setDraftMonthRows(serverMonthRows);
      setDraftInitializedMonth(month);
      return;
    }
    if (!isDirty) {
      setDraftMonthRows(serverMonthRows);
    }
  }, [draftInitializedMonth, draftMonth, hasLoadedAvailability, isDirty, isOpen, month, serverMonthRows]);

  const draftSortedRows = useMemo(() => {
    return draftMonthRows
      .slice()
      .sort((a, b) => a.day_of_week.localeCompare(b.day_of_week) || a.available_start.localeCompare(b.available_start));
  }, [draftMonthRows]);

  const canAdd = useMemo(() => {
    const anyDay = Object.values(selectedDays).some(Boolean);
    return anyDay && !!startTime && !!endTime;
  }, [selectedDays, startTime, endTime]);

  const anyDaySelected = useMemo(() => Object.values(selectedDays).some(Boolean), [selectedDays]);
  const stepMinutes = 15;

  const resetTimes = useCallback(() => {
    const startMin = parseHmToMinutes(branchTimeStart) ?? 6 * 60;
    const endMax = parseHmToMinutes(branchTimeEnd) ?? 23 * 60;
    const nextStart = clamp(startMin, 0, endMax - stepMinutes);
    const nextEnd = clamp(nextStart + stepMinutes, nextStart + stepMinutes, endMax);
    setStartTime(minutesToHm(nextStart));
    setEndTime(minutesToHm(nextEnd));
  }, [branchTimeEnd, branchTimeStart]);

  const startMax = useMemo(() => {
    const branchEnd = parseHmToMinutes(branchTimeEnd);
    const endSelected = parseHmToMinutes(endTime);
    const maxFromBranch = branchEnd === null ? null : branchEnd - stepMinutes;
    const maxFromEnd = endSelected === null ? null : endSelected - stepMinutes;

    let max = maxFromBranch;
    if (maxFromEnd !== null) max = max === null ? maxFromEnd : Math.min(max, maxFromEnd);
    if (max === null) return branchTimeEnd;
    return minutesToHm(max);
  }, [branchTimeEnd, endTime]);

  const endMin = useMemo(() => {
    const startMin = parseHmToMinutes(startTime);
    if (startMin === null) return startTime;
    return minutesToHm(startMin + stepMinutes);
  }, [startTime]);

  const handleEndTimeChange = useCallback(
    (next: string) => {
      setEndTime(next);
      const nextEndMin = parseHmToMinutes(next);
      const currentStartMin = parseHmToMinutes(startTime);
      if (nextEndMin === null) return;
      const latestAllowedStart = nextEndMin - stepMinutes;
      if (currentStartMin === null || currentStartMin >= nextEndMin) {
        const branchStartMin = parseHmToMinutes(branchTimeStart) ?? 0;
        setStartTime(minutesToHm(Math.max(branchStartMin, latestAllowedStart)));
      }
    },
    [branchTimeStart, startTime],
  );

  const handleStartTimeChange = useCallback(
    (next: string) => {
      setStartTime(next);
      const nextStartMin = parseHmToMinutes(next);
      const currentEndMin = parseHmToMinutes(endTime);
      if (nextStartMin === null) return;
      const minAllowedEnd = nextStartMin + stepMinutes;
      if (currentEndMin === null || currentEndMin <= nextStartMin) {
        setEndTime(minutesToHm(minAllowedEnd));
      }
    },
    [endTime],
  );

  const handleAdd = useCallback(() => {
    if (!canAdd) return;
    setError(null);

    const startMin = parseHmToMinutes(startTime);
    const endMinVal = parseHmToMinutes(endTime);
    if (startMin === null || endMinVal === null || endMinVal <= startMin) {
      setError("End time must be greater than start time.");
      return;
    }

    const days = DAYS.filter((d) => !!selectedDays[d]);
    const additions: AvailabilityRow[] = days.map((d) => ({
      id: `draft:${month}:${d}:${startTime}-${endTime}`,
      branch_id: branchId,
      instructor_id: instructorId,
      schedule_month: month,
      day_of_week: d,
      available_start: startTime,
      available_end: endTime,
    }));

    setDraftMonthRows((prev) => {
      const existing = new Set(prev.map(rowKey));
      const next = prev.slice();
      for (const a of additions) {
        const k = rowKey(a);
        if (!existing.has(k)) {
          existing.add(k);
          next.push(a);
        }
      }
      return next;
    });

    // Reset day checks after staging add
    setSelectedDays((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const d of DAYS) next[d] = false;
      return next;
    });
  }, [branchId, canAdd, endTime, instructorId, month, selectedDays, startTime]);

  const handleDraftDelete = useCallback((r: AvailabilityRow) => {
    setDraftMonthRows((prev) => prev.filter((x) => rowKey(x) !== rowKey(r)));
  }, []);

  const requestSetMonth = useCallback(
    (nextMonth: string) => {
      if (nextMonth === month) return;
      if (isDirtyEffective) {
        const ok = confirm("You have unsaved changes. Discard changes and switch month?");
        if (!ok) return;
      }
      setError(null);
      setSelectedDays((prev) => {
        const next: Record<string, boolean> = { ...prev };
        for (const d of DAYS) next[d] = false;
        return next;
      });
      setMonth(nextMonth);
    },
    [isDirtyEffective, month],
  );

  const handleCancel = useCallback(() => {
    if (isDirtyEffective) {
      const ok = confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    setError(null);
    onClose();
  }, [isDirtyEffective, onClose]);

  const handleSave = useCallback(async () => {
    if (!branchId || !instructorId) return;
    if (!isDirtyEffective) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const toDelete = serverMonthRows.filter((r) => !draftKeys.has(rowKey(r)));
      const toAdd = draftMonthRows.filter((r) => !serverKeys.has(rowKey(r)));

      // Deletes
      for (const r of toDelete) {
        const res = await fetch(
          `/api/scheduling/instructor-availability?id=${encodeURIComponent(r.id)}&branch_id=${encodeURIComponent(branchId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || "Failed to delete availability");
        }
      }

      // Adds (batch)
      if (toAdd.length > 0) {
        const items = toAdd.map((r) => ({
          schedule_month: month,
          day_of_week: String(r.day_of_week).toUpperCase(),
          available_start: normalizeHm(String(r.available_start)),
          available_end: normalizeHm(String(r.available_end)),
        }));

        const res = await fetch("/api/scheduling/instructor-availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: branchId,
            instructor_id: instructorId,
            items,
          }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || "Failed to save availability");
        }
      }

      await fetchAllRows();
      onUpdated?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save availability");
    } finally {
      setSaving(false);
    }
  }, [
    branchId,
    draftKeys,
    draftMonthRows,
    fetchAllRows,
    instructorId,
    isDirtyEffective,
    month,
    onClose,
    onUpdated,
    serverKeys,
    serverMonthRows,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCancel} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Instructor availability"
        className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--brand-strong)] bg-[rgb(var(--brand-rgb)/0.95)] p-6 shadow-2xl backdrop-blur-md"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand-ink)]">Instructor Availability</h2>
            <p className="text-sm text-[var(--brand-ink)]/70">
              {instructorLabel} • {month}
            </p>
            <p className="mt-1 text-xs text-[var(--brand-ink)]/60">
              If no availability windows exist for a month, the instructor is assumed available (no enforcement).
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-full p-1.5 text-[var(--brand-ink)]/70 hover:bg-[var(--brand-strong)] hover:text-white"
            aria-label="Close availability modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mb-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-2 text-sm font-medium text-foreground">Select Month</div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Year</span>
              <PopoverSelect
                value={String(selectedYear)}
                options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
                onChange={(nextY) => requestSetMonth(`${nextY}-${selectedMonthValue}`)}
                ariaLabel="Availability year"
                className="min-w-[120px]"
                contentClassName="w-[140px]"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {MONTHS.map((m) => {
                const active = m.value === selectedMonthValue;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => requestSetMonth(`${selectedYear}-${m.value}`)}
                    className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                      active
                        ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                        : "border border-white/10 bg-black/20 text-foreground hover:bg-black/30"
                    }`}
                    aria-pressed={active}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">Add availability windows</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetTimes}
                disabled={!anyDaySelected || saving}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Reset times"
              >
                <RotateCcw className="h-3.5 w-3.5 text-[var(--cta)]" />
                Reset times
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (isDirtyEffective) {
                    const ok = confirm("Discard unsaved changes and refresh from server?");
                    if (!ok) return;
                  }
                  await fetchAllRows();
                }}
                disabled={loading}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-foreground transition hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            {DAYS.map((d) => {
              const checked = !!selectedDays[d];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDays((prev) => ({ ...prev, [d]: !prev[d] }))}
                  className={`rounded-full px-2 py-1 text-xs font-semibold transition ${
                    checked
                      ? "bg-[var(--cta)] text-[var(--cta-foreground)]"
                      : "border border-white/10 bg-black/20 text-foreground hover:bg-black/30"
                  }`}
                  aria-pressed={checked}
                >
                  {dayLabel(d)}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Start</label>
              <TimePicker
                value={startTime}
                onChange={handleStartTimeChange}
                ariaLabel="Start time"
                stepMinutes={stepMinutes}
                minTime={branchTimeStart}
                maxTime={startMax}
                disabled={!anyDaySelected}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">End</label>
              <TimePicker
                value={endTime}
                onChange={handleEndTimeChange}
                ariaLabel="End time"
                stepMinutes={stepMinutes}
                minTime={endMin}
                maxTime={branchTimeEnd}
                disabled={!anyDaySelected}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!canAdd || saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 text-sm font-medium text-foreground">
            Current windows ({draftSortedRows.length})
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : draftSortedRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No availability windows set for this month.
            </div>
          ) : (
            <div className="max-h-[320px] overflow-auto rounded-lg border border-white/10 bg-black/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/40 text-xs text-muted-foreground">
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-2 text-left">Day</th>
                    <th className="px-3 py-2 text-left">Window</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {draftSortedRows.map((r) => (
                    <tr key={rowKey(r)} className="hover:bg-white/5">
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {r.day_of_week}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {r.available_start}–{r.available_end}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDraftDelete(r)}
                          disabled={saving}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-xs text-foreground/70">
            {isDirtyEffective ? "Unsaved changes" : "No changes"}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="btn-pill border border-white/15 bg-black/20 px-4 py-2 text-sm font-semibold text-foreground hover:bg-black/30 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !isDirtyEffective}
              className="btn-pill bg-[var(--cta)] px-4 py-2 text-sm font-semibold text-[var(--cta-foreground)] shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

