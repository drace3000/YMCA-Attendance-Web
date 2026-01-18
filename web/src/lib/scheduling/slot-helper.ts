import type { InstructorAvailability, SessionForConflicts } from "@/lib/scheduling/conflict-engine";

export type SlotHelperDayFilter = "ALL" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export type SlotHelperHolidayClosure = {
  // Effective date (observed_date if present, else holiday_date)
  date: string; // "YYYY-MM-DD"
  is_closed?: boolean;
  closed_start_time?: string | null; // "HH:mm"
  closed_end_time?: string | null; // "HH:mm"
};

export type SlotHelperCandidate = {
  date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  availableLocationIds: string[];
  availableInstructorIds: string[];
};

export type SlotHelperResultByDate = {
  date: string; // "YYYY-MM-DD"
  day_of_week: Exclude<SlotHelperDayFilter, "ALL">;
  slots: SlotHelperCandidate[];
};

type ParsedInterval = { startMin: number; endMin: number };

function parseHHmmToMinutes(hhmm: string): number | null {
  const v = String(hhmm ?? "").slice(0, 5);
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToHHmm(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function dayOfWeekFromIsoDateUtc(isoDate: string): Exclude<SlotHelperDayFilter, "ALL"> | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const name = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const up = String(name || "").trim().toUpperCase();
  if (
    up === "MONDAY" ||
    up === "TUESDAY" ||
    up === "WEDNESDAY" ||
    up === "THURSDAY" ||
    up === "FRIDAY" ||
    up === "SATURDAY" ||
    up === "SUNDAY"
  ) {
    return up;
  }
  return null;
}

function listDatesForMonth(scheduleMonth: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(scheduleMonth)) return [];
  const year = Number(scheduleMonth.slice(0, 4));
  const month = Number(scheduleMonth.slice(5, 7)); // 1-12
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    out.push(`${year}-${mm}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeDayFilter(day: string | null | undefined): SlotHelperDayFilter {
  const up = String(day ?? "").trim().toUpperCase();
  if (up === "ALL") return "ALL";
  if (
    up === "MONDAY" ||
    up === "TUESDAY" ||
    up === "WEDNESDAY" ||
    up === "THURSDAY" ||
    up === "FRIDAY" ||
    up === "SATURDAY" ||
    up === "SUNDAY"
  ) {
    return up;
  }
  return "ALL";
}

function buildAvailabilityIndex(
  scheduleMonth: string,
  instructorAvailability: InstructorAvailability[],
): Map<string, Map<string, ParsedInterval[]>> {
  // instructor_id -> day_of_week -> windows
  const map = new Map<string, Map<string, ParsedInterval[]>>();

  for (const r of instructorAvailability ?? []) {
    if (!r?.instructor_id) continue;
    if (r.schedule_month !== scheduleMonth) continue;
    const id = String(r.instructor_id).trim();
    const day = String(r.day_of_week ?? "").trim().toUpperCase();
    const startMin = parseHHmmToMinutes(r.available_start);
    const endMin = parseHHmmToMinutes(r.available_end);
    if (!id || !day || startMin === null || endMin === null || endMin <= startMin) continue;

    const byDay = map.get(id) ?? new Map<string, ParsedInterval[]>();
    const list = byDay.get(day) ?? [];
    list.push({ startMin, endMin });
    byDay.set(day, list);
    map.set(id, byDay);
  }

  // Deterministic sorts
  for (const [id, byDay] of map.entries()) {
    for (const [day, list] of byDay.entries()) {
      list.sort((a, b) => a.startMin - b.startMin);
      byDay.set(day, list);
    }
    map.set(id, byDay);
  }

  return map;
}

function isWithinAnyWindow(startMin: number, endMin: number, windows: ParsedInterval[]): boolean {
  return windows.some((w) => startMin >= w.startMin && endMin <= w.endMin);
}

function buildHolidayClosureIndex(closures: SlotHelperHolidayClosure[] | undefined): Map<string, ParsedInterval[] | null> {
  // date -> null (full day closed) OR list of windows that are closed
  const map = new Map<string, ParsedInterval[] | null>();

  for (const h of closures ?? []) {
    const date = String(h?.date ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (h?.is_closed !== true) continue;

    const startMin = parseHHmmToMinutes(String(h?.closed_start_time ?? "").slice(0, 5));
    const endMin = parseHHmmToMinutes(String(h?.closed_end_time ?? "").slice(0, 5));
    const hasWindow = startMin !== null && endMin !== null && endMin > startMin;

    if (!hasWindow) {
      // full-day closure wins
      map.set(date, null);
      continue;
    }

    const existing = map.get(date);
    if (existing === null) continue; // already full-day closed
    const list = existing ?? [];
    list.push({ startMin, endMin });
    list.sort((a, b) => a.startMin - b.startMin);
    map.set(date, list);
  }

  return map;
}

function buildBusyIndex(opts: {
  sessions: SessionForConflicts[];
  scheduleMonth: string;
  transitionMinutes: number;
  turnoverMinutes: number;
}): {
  byDateLocation: Map<string, Map<string, ParsedInterval[]>>;
  byDateInstructor: Map<string, Map<string, ParsedInterval[]>>;
} {
  const { sessions, scheduleMonth, transitionMinutes, turnoverMinutes } = opts;
  const byDateLocation = new Map<string, Map<string, ParsedInterval[]>>();
  const byDateInstructor = new Map<string, Map<string, ParsedInterval[]>>();

  for (const s of sessions ?? []) {
    const date = String(s?.session_date ?? "").slice(0, 10);
    if (!date.startsWith(`${scheduleMonth}-`)) continue;

    const startMinRaw = parseHHmmToMinutes(String(s?.start_time ?? "").slice(0, 5));
    const endMinRaw = parseHHmmToMinutes(String(s?.end_time ?? "").slice(0, 5));
    if (startMinRaw === null || endMinRaw === null || endMinRaw <= startMinRaw) continue;

    // Location busy with turnover buffer
    const locId = String(s?.location_id ?? "").trim();
    if (locId) {
      const startMin = Math.max(0, startMinRaw - turnoverMinutes);
      const endMin = Math.min(24 * 60, endMinRaw + turnoverMinutes);
      const byLoc = byDateLocation.get(date) ?? new Map<string, ParsedInterval[]>();
      const list = byLoc.get(locId) ?? [];
      list.push({ startMin, endMin });
      list.sort((a, b) => a.startMin - b.startMin);
      byLoc.set(locId, list);
      byDateLocation.set(date, byLoc);
    }

    // Instructor busy with transition buffer
    for (const inst of s?.instructor_ids ?? []) {
      const instId = String(inst ?? "").trim();
      if (!instId) continue;
      const startMin = Math.max(0, startMinRaw - transitionMinutes);
      const endMin = Math.min(24 * 60, endMinRaw + transitionMinutes);
      const byInst = byDateInstructor.get(date) ?? new Map<string, ParsedInterval[]>();
      const list = byInst.get(instId) ?? [];
      list.push({ startMin, endMin });
      list.sort((a, b) => a.startMin - b.startMin);
      byInst.set(instId, list);
      byDateInstructor.set(date, byInst);
    }
  }

  return { byDateLocation, byDateInstructor };
}

function isFree(candidate: ParsedInterval, busy: ParsedInterval[] | undefined): boolean {
  if (!busy || busy.length === 0) return true;
  return !busy.some((b) => overlaps(candidate.startMin, candidate.endMin, b.startMin, b.endMin));
}

export function buildSlotHelperAvailability(opts: {
  scheduleMonth: string; // YYYY-MM
  dayStartHHmm: string; // HH:mm
  dayEndHHmm: string; // HH:mm
  sessions: SessionForConflicts[]; // schedule-scoped sessions
  locationIds: string[];
  instructorIds: string[];
  instructorAvailability: InstructorAvailability[]; // month-scoped allow-list
  holidays?: SlotHelperHolidayClosure[]; // effective closures only
  durationMinutes: number; // multiple of 15
  transitionMinutes: number; // instructor buffer
  turnoverMinutes: number; // location buffer
  dayFilter?: SlotHelperDayFilter; // default ALL
  stepMinutes?: number; // default 15
}): SlotHelperResultByDate[] {
  const scheduleMonth = String(opts.scheduleMonth ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(scheduleMonth)) return [];

  const dayStartMin = parseHHmmToMinutes(opts.dayStartHHmm);
  const dayEndMin = parseHHmmToMinutes(opts.dayEndHHmm);
  if (dayStartMin === null || dayEndMin === null || dayEndMin <= dayStartMin) return [];

  const step = clampInt(opts.stepMinutes ?? 15, 5, 60, 15);
  const duration = clampInt(opts.durationMinutes, 15, 24 * 60, 60);
  const transition = clampInt(opts.transitionMinutes, 0, 240, 0);
  const turnover = clampInt(opts.turnoverMinutes, 0, 240, 0);

  const dayFilter = normalizeDayFilter(opts.dayFilter);

  const locIds = Array.from(new Set((opts.locationIds ?? []).map((id) => String(id).trim()).filter(Boolean))).sort();
  const instIds = Array.from(new Set((opts.instructorIds ?? []).map((id) => String(id).trim()).filter(Boolean))).sort();

  const availabilityIndex = buildAvailabilityIndex(scheduleMonth, opts.instructorAvailability ?? []);
  const holidayIndex = buildHolidayClosureIndex(opts.holidays);
  const busy = buildBusyIndex({
    sessions: opts.sessions ?? [],
    scheduleMonth,
    transitionMinutes: transition,
    turnoverMinutes: turnover,
  });

  const out: SlotHelperResultByDate[] = [];

  for (const date of listDatesForMonth(scheduleMonth)) {
    const dow = dayOfWeekFromIsoDateUtc(date);
    if (!dow) continue;
    if (dayFilter !== "ALL" && dow !== dayFilter) continue;

    const holiday = holidayIndex.get(date);
    if (holiday === null) {
      // fully closed day
      out.push({ date, day_of_week: dow, slots: [] });
      continue;
    }

    const slots: SlotHelperCandidate[] = [];

    for (let startMin = dayStartMin; startMin + duration <= dayEndMin; startMin += step) {
      const endMin = startMin + duration;
      const candidate: ParsedInterval = { startMin, endMin };

      // Holiday window blocks
      if (holiday && holiday.some((h) => overlaps(candidate.startMin, candidate.endMin, h.startMin, h.endMin))) {
        continue;
      }

      // Available locations
      const byLoc = busy.byDateLocation.get(date);
      const availableLocationIds = locIds.filter((locId) => isFree(candidate, byLoc?.get(locId)));
      if (availableLocationIds.length === 0) continue;

      // Available instructors (must be free and, if rules exist for instructor+month, must be within a window)
      const byInst = busy.byDateInstructor.get(date);
      const availableInstructorIds = instIds.filter((instId) => {
        if (!isFree(candidate, byInst?.get(instId))) return false;

        const instWindowsByDay = availabilityIndex.get(instId) ?? null;
        if (!instWindowsByDay) return true; // no rules for this instructor in this month => anytime
        const windows = instWindowsByDay.get(dow) ?? [];
        if (windows.length === 0) return false;
        return isWithinAnyWindow(candidate.startMin, candidate.endMin, windows);
      });
      if (availableInstructorIds.length === 0) continue;

      slots.push({
        date,
        start_time: minutesToHHmm(startMin),
        end_time: minutesToHHmm(endMin),
        availableLocationIds,
        availableInstructorIds,
      });
    }

    out.push({ date, day_of_week: dow, slots });
  }

  return out;
}


