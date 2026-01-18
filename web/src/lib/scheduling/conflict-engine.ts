export type ConflictSeverity = "HIGH" | "MEDIUM" | "LOW";

export type ConflictType =
  | "INSTRUCTOR_DOUBLE_BOOKING"
  | "LOCATION_DOUBLE_BOOKING"
  | "INSTRUCTOR_TRANSITION_TIME"
  | "LOCATION_TURNOVER_TIME"
  | "INSTRUCTOR_MAX_HOURS"
  | "INSTRUCTOR_OUTSIDE_AVAILABILITY"
  // YMCA/project-level validations (not in the base spec, but required by project rules)
  | "INVALID_TIME_FORMAT"
  | "INVALID_TIME_RANGE"
  | "DAY_OF_WEEK_MISMATCH"
  | "OUTSIDE_SCHEDULE_MONTH"
  | "HOLIDAY";

export interface SessionForConflicts {
  id: string;
  day_of_week: string; // e.g. "MONDAY"
  session_date: string; // "YYYY-MM-DD"
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  class_name?: string | null;
  location_code?: string | null;
  location_id?: string | null;
  instructor_ids: string[]; // supports multi-instructor sessions
}

export interface InstructorAvailability {
  instructor_id: string;
  schedule_month: string; // "YYYY-MM"
  day_of_week: string; // e.g. "MONDAY"
  available_start: string; // "HH:mm"
  available_end: string; // "HH:mm"
}

export interface ConflictEngineConfig {
  minInstructorTransitionMinutes: number; // recommended default: 15
  minLocationTurnoverMinutes: number; // recommended default: 15
  maxDailyInstructorMinutes: number; // recommended default: 360 (6 hours)

  enableTransitionWarnings: boolean;
  enableTurnoverWarnings: boolean;
  enableMaxHoursWarnings: boolean;

  // Optional data inputs
  scheduleMonth?: string; // "YYYY-MM" - when provided, sessions outside month are HIGH
  holidayDates?: string[]; // ISO dates "YYYY-MM-DD" - warning only (legacy: full-day closures)
  holidayClosures?: Array<{
    date: string; // "YYYY-MM-DD"
    closed_start_time?: string | null; // "HH:mm" (partial-day)
    closed_end_time?: string | null; // "HH:mm" (partial-day)
  }>;
  holidays?: Array<{
    holiday_date: string; // "YYYY-MM-DD" (actual)
    observed_date?: string | null; // "YYYY-MM-DD" (effective when present)
    name: string;
    is_closed?: boolean;
    closed_start_time?: string | null; // "HH:mm"
    closed_end_time?: string | null; // "HH:mm"
  }>;
  instructorAvailability?: InstructorAvailability[]; // allow-list enforcement when entries exist for instructor+month
}

export interface ScheduleConflict {
  type: ConflictType;
  severity: ConflictSeverity;
  date: string; // "YYYY-MM-DD"
  session_a_id: string;
  session_b_id?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export function getDefaultConflictEngineConfig(): ConflictEngineConfig {
  return {
    minInstructorTransitionMinutes: 15,
    minLocationTurnoverMinutes: 15,
    maxDailyInstructorMinutes: 6 * 60,
    enableTransitionWarnings: true,
    enableTurnoverWarnings: true,
    enableMaxHoursWarnings: true,
  };
}

function normalizeDayOfWeek(day: string): string {
  return (day || "").trim().toUpperCase();
}

function dayOfWeekFromIsoDate(date: string): string | null {
  // Use UTC to avoid timezone drift.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(date + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const name = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return normalizeDayOfWeek(name);
}

function parseTimeToMinutes(time: string): number | null {
  // Accept "HH:mm" (00-23, 00-59)
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

type ParsedSession = {
  s: SessionForConflicts;
  startMin: number;
  endMin: number;
};

function overlaps(a: ParsedSession, b: ParsedSession): boolean {
  // Overlap if (a.start < b.end) && (b.start < a.end)
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function normalizeLocationKey(s: SessionForConflicts): string {
  const code = (s.location_code ?? "").trim().toUpperCase();
  if (code) return code;
  const id = (s.location_id ?? "").trim();
  if (id) return id;
  return "";
}

function gapMinutes(earlier: ParsedSession, later: ParsedSession): number {
  return later.startMin - earlier.endMin;
}

function intersectsAnyInstructor(a: SessionForConflicts, b: SessionForConflicts): string[] {
  if (!a.instructor_ids.length || !b.instructor_ids.length) return [];
  const setA = new Set(a.instructor_ids);
  const shared: string[] = [];
  for (const id of b.instructor_ids) {
    if (setA.has(id)) shared.push(id);
  }
  return shared;
}

export function detectScheduleConflicts(
  sessions: SessionForConflicts[],
  config?: Partial<ConflictEngineConfig>,
): ScheduleConflict[] {
  const cfg: ConflictEngineConfig = { ...getDefaultConflictEngineConfig(), ...(config ?? {}) };
  // Holiday closures index.
  // - cfg.holidayDates is legacy and treated as full-day closures.
  // - cfg.holidayClosures may include partial-day windows.
  // - cfg.holidays is the preferred input (supports observed_date override + holiday names + non-closed info).
  const holidayIndex = new Map<
    string,
    Array<{
      date: string;
      name: string | null;
      startMin: number | null;
      endMin: number | null;
      start: string | null;
      end: string | null;
    }>
  >();
  const holidayInfoNamesByDate = new Map<string, Set<string>>();

  for (const d of cfg.holidayDates ?? []) {
    const date = String(d ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const list = holidayIndex.get(date) ?? [];
    list.push({ date, name: null, startMin: null, endMin: null, start: null, end: null });
    holidayIndex.set(date, list);
  }

  for (const h of cfg.holidayClosures ?? []) {
    const date = String(h?.date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const start = String(h?.closed_start_time ?? "").slice(0, 5);
    const end = String(h?.closed_end_time ?? "").slice(0, 5);
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    const hasWindow = startMin !== null && endMin !== null && endMin > startMin;
    const list = holidayIndex.get(date) ?? [];
    list.push({
      date,
      name: null,
      startMin: hasWindow ? startMin : null,
      endMin: hasWindow ? endMin : null,
      start: hasWindow ? start : null,
      end: hasWindow ? end : null,
    });
    holidayIndex.set(date, list);
  }

  for (const h of cfg.holidays ?? []) {
    const actual = String(h?.holiday_date ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(actual)) continue;
    const observed = String(h?.observed_date ?? "").trim().slice(0, 10);
    const effective = /^\d{4}-\d{2}-\d{2}$/.test(observed) ? observed : actual;

    const name = String(h?.name ?? "").trim();
    const isClosed = h?.is_closed === true;

    if (!isClosed) {
      if (name) {
        const set = holidayInfoNamesByDate.get(effective) ?? new Set<string>();
        set.add(name);
        holidayInfoNamesByDate.set(effective, set);
      }
      continue;
    }

    const start = String(h?.closed_start_time ?? "").slice(0, 5);
    const end = String(h?.closed_end_time ?? "").slice(0, 5);
    const startMin = parseTimeToMinutes(start);
    const endMin = parseTimeToMinutes(end);
    const hasWindow = startMin !== null && endMin !== null && endMin > startMin;

    const list = holidayIndex.get(effective) ?? [];
    list.push({
      date: effective,
      name: name || null,
      startMin: hasWindow ? startMin : null,
      endMin: hasWindow ? endMin : null,
      start: hasWindow ? start : null,
      end: hasWindow ? end : null,
    });
    holidayIndex.set(effective, list);
  }

  const conflicts: ScheduleConflict[] = [];

  type AvailabilityWindow = { startMin: number; endMin: number; start: string; end: string };
  const availabilityIndex = new Map<string, Map<string, AvailabilityWindow[]>>(); // instructor_id -> day_of_week -> windows

  if (cfg.scheduleMonth && cfg.instructorAvailability && cfg.instructorAvailability.length > 0) {
    for (const r of cfg.instructorAvailability) {
      if (!r?.instructor_id) continue;
      if (!r.schedule_month || r.schedule_month !== cfg.scheduleMonth) continue;

      const day = normalizeDayOfWeek(r.day_of_week);
      if (!day) continue;

      const start = String(r.available_start ?? "").slice(0, 5);
      const end = String(r.available_end ?? "").slice(0, 5);
      const startMin = parseTimeToMinutes(start);
      const endMin = parseTimeToMinutes(end);
      if (startMin === null || endMin === null) continue;
      if (endMin <= startMin) continue;

      if (!availabilityIndex.has(r.instructor_id)) {
        availabilityIndex.set(r.instructor_id, new Map());
      }
      const byDay = availabilityIndex.get(r.instructor_id)!;
      const list = byDay.get(day) ?? [];
      list.push({ startMin, endMin, start, end });
      byDay.set(day, list);
    }
  }

  // 1) Per-session validations + parse times
  const parsedById = new Map<string, ParsedSession>();
  for (const s of sessions) {
    const date = s.session_date;

    // Month mismatch (blocking)
    if (cfg.scheduleMonth) {
      const month = date.slice(0, 7);
      if (month !== cfg.scheduleMonth) {
        conflicts.push({
          type: "OUTSIDE_SCHEDULE_MONTH",
          severity: "HIGH",
          date,
          session_a_id: s.id,
          message: `Session date ${date} is outside the schedule month (${cfg.scheduleMonth}).`,
          meta: { scheduleMonth: cfg.scheduleMonth },
        });
      }
    }

    // Day-of-week mismatch (blocking)
    const expectedDow = dayOfWeekFromIsoDate(date);
    if (expectedDow) {
      const actualDow = normalizeDayOfWeek(s.day_of_week);
      if (actualDow && actualDow !== expectedDow) {
        conflicts.push({
          type: "DAY_OF_WEEK_MISMATCH",
          severity: "HIGH",
          date,
          session_a_id: s.id,
          message: `Day-of-week mismatch: session_date ${date} is ${expectedDow}, but session is marked ${actualDow}.`,
          meta: { expected: expectedDow, actual: actualDow },
        });
      }
    }

    const startMin = parseTimeToMinutes(s.start_time);
    const endMin = parseTimeToMinutes(s.end_time);
    if (startMin === null || endMin === null) {
      conflicts.push({
        type: "INVALID_TIME_FORMAT",
        severity: "HIGH",
        date,
        session_a_id: s.id,
        message: `Invalid time format (expected HH:mm): ${s.start_time}–${s.end_time}.`,
      });
      continue;
    }

    // Block cross-midnight and zero/negative durations.
    if (endMin <= startMin) {
      conflicts.push({
        type: "INVALID_TIME_RANGE",
        severity: "HIGH",
        date,
        session_a_id: s.id,
        message: `Invalid time range: end_time must be after start_time (${s.start_time}–${s.end_time}).`,
        meta: { startMin, endMin },
      });
      continue;
    }

    // Holiday closure check (blocking when closed)
    // Triggers when closures are provided (i.e., branch has marked closed on that date/time).
    const closures = holidayIndex.get(date) ?? [];
    if (closures.length > 0) {
      const fullDay = closures.some((c) => c.startMin === null || c.endMin === null);
      if (fullDay) {
        const names = Array.from(
          new Set(closures.map((c) => c.name).filter((n): n is string => !!n && !!n.trim())),
        );
        conflicts.push({
          type: "HOLIDAY",
          severity: "HIGH",
          date,
          session_a_id: s.id,
          message: names.length > 0
            ? `Closed holiday: session is scheduled on (${names.join(", ")}).`
            : `Closed holiday: session is scheduled on (${date}).`,
          meta: names.length > 0 ? { holidayNames: names } : undefined,
        });
      } else {
        const hit = closures.find((c) => {
          if (c.startMin === null || c.endMin === null) return true;
          return startMin < c.endMin && c.startMin < endMin;
        });
        if (hit && hit.start && hit.end) {
          conflicts.push({
            type: "HOLIDAY",
            severity: "HIGH",
            date,
            session_a_id: s.id,
            message: hit.name
              ? `Closed holiday: session overlaps a closed window (${hit.name} ${hit.start}–${hit.end}).`
              : `Closed holiday: session overlaps a closed window (${date} ${hit.start}–${hit.end}).`,
            meta: { window: { start: hit.start, end: hit.end }, ...(hit.name ? { holidayName: hit.name } : {}) },
          });
        }
      }
    } else {
      // Informational note for non-closed holidays.
      const names = holidayInfoNamesByDate.get(date);
      if (names && names.size > 0) {
        const list = Array.from(names.values()).sort((a, b) => a.localeCompare(b));
        conflicts.push({
          type: "HOLIDAY",
          severity: "LOW",
          date,
          session_a_id: s.id,
          message: `Info: this date is ${list.join(", ")}.`,
          meta: { holidayNames: list },
        });
      }
    }

    parsedById.set(s.id, { s, startMin, endMin });
  }

  // Only consider sessions with valid time ranges for pairwise checks.
  const validSessions: ParsedSession[] = [];
  for (const s of sessions) {
    const parsed = parsedById.get(s.id);
    if (parsed) validSessions.push(parsed);
  }

  // 2) Group by date for efficient comparison
  const byDate = new Map<string, ParsedSession[]>();
  for (const ps of validSessions) {
    const date = ps.s.session_date;
    const list = byDate.get(date);
    if (list) list.push(ps);
    else byDate.set(date, [ps]);
  }

  for (const [date, dateSessions] of byDate.entries()) {
    // Stable sort by start time so sequential checks are deterministic.
    dateSessions.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || a.s.id.localeCompare(b.s.id));

    // Pairwise checks (Types 1-4)
    for (let i = 0; i < dateSessions.length; i++) {
      for (let j = i + 1; j < dateSessions.length; j++) {
        const a = dateSessions[i];
        const b = dateSessions[j];
        if (a.s.id === b.s.id) continue;

        const aLoc = normalizeLocationKey(a.s);
        const bLoc = normalizeLocationKey(b.s);
        const aClass = (a.s.class_name ?? "").trim();
        const bClass = (b.s.class_name ?? "").trim();

        const sharedInstructors = intersectsAnyInstructor(a.s, b.s);

        // Type 1: Instructor Double-Booking (HIGH)
        if (sharedInstructors.length > 0 && overlaps(a, b)) {
          conflicts.push({
            type: "INSTRUCTOR_DOUBLE_BOOKING",
            severity: "HIGH",
            date,
            session_a_id: a.s.id,
            session_b_id: b.s.id,
            message: `Instructor double-booking: one or more instructors are scheduled for overlapping sessions (${a.s.start_time}–${a.s.end_time} and ${b.s.start_time}–${b.s.end_time}).`,
            meta: { instructor_ids: sharedInstructors },
          });
        }

        // Type 2: Location Double-Booking (HIGH)
        if (aLoc && aLoc === bLoc && overlaps(a, b)) {
          conflicts.push({
            type: "LOCATION_DOUBLE_BOOKING",
            severity: "HIGH",
            date,
            session_a_id: a.s.id,
            session_b_id: b.s.id,
            message: `Location double-booking: ${aLoc} has overlapping sessions (${a.s.start_time}–${a.s.end_time} and ${b.s.start_time}–${b.s.end_time}).`,
            meta: { location_code: aLoc },
          });
        }

        // Type 3: Instructor Transition Time (MEDIUM) - only when non-overlapping and different locations
        if (
          cfg.enableTransitionWarnings &&
          sharedInstructors.length > 0 &&
          aLoc &&
          bLoc &&
          aLoc !== bLoc
        ) {
          const earlier = a.endMin <= b.startMin ? a : b.endMin <= a.startMin ? b : null;
          const later = earlier === a ? b : earlier === b ? a : null;
          if (earlier && later) {
            const gap = gapMinutes(earlier, later);
            if (gap >= 0 && gap < cfg.minInstructorTransitionMinutes) {
              conflicts.push({
                type: "INSTRUCTOR_TRANSITION_TIME",
                severity: "MEDIUM",
                date,
                session_a_id: earlier.s.id,
                session_b_id: later.s.id,
                message: `Warning: only ${gap} minutes transition time between locations (${(earlier.s.location_code ?? "—").toString()} → ${(later.s.location_code ?? "—").toString()}).`,
                meta: { gap_minutes: gap, instructor_ids: sharedInstructors, from: aLoc, to: bLoc },
              });
            }
          }
        }

        // Type 4: Location Turnover Time (LOW) - only when non-overlapping, same location, different class types
        if (cfg.enableTurnoverWarnings && aLoc && aLoc === bLoc && aClass && bClass && aClass !== bClass) {
          const earlier = a.endMin <= b.startMin ? a : b.endMin <= a.startMin ? b : null;
          const later = earlier === a ? b : earlier === b ? a : null;
          if (earlier && later) {
            const gap = gapMinutes(earlier, later);
            if (gap >= 0 && gap < cfg.minLocationTurnoverMinutes) {
              conflicts.push({
                type: "LOCATION_TURNOVER_TIME",
                severity: "LOW",
                date,
                session_a_id: earlier.s.id,
                session_b_id: later.s.id,
                message: `Note: only ${gap} minutes turnover time in location ${aLoc} between different classes.`,
                meta: { gap_minutes: gap, location_code: aLoc },
              });
            }
          }
        }
      }
    }

    // Type 5: Instructor Maximum Daily Hours (MEDIUM)
    if (cfg.enableMaxHoursWarnings) {
      const minutesByInstructor = new Map<string, number>();
      const exemplarSessionByInstructor = new Map<string, string>();

      for (const ps of dateSessions) {
        const duration = ps.endMin - ps.startMin;
        for (const instructorId of ps.s.instructor_ids) {
          minutesByInstructor.set(instructorId, (minutesByInstructor.get(instructorId) ?? 0) + duration);
          if (!exemplarSessionByInstructor.has(instructorId)) {
            exemplarSessionByInstructor.set(instructorId, ps.s.id);
          }
        }
      }

      for (const [instructorId, totalMinutes] of minutesByInstructor.entries()) {
        if (totalMinutes > cfg.maxDailyInstructorMinutes) {
          conflicts.push({
            type: "INSTRUCTOR_MAX_HOURS",
            severity: "MEDIUM",
            date,
            session_a_id: exemplarSessionByInstructor.get(instructorId) ?? dateSessions[0]?.s.id ?? "unknown",
            message: `Warning: instructor exceeds daily max (${Math.round(totalMinutes)} minutes scheduled; max ${cfg.maxDailyInstructorMinutes} minutes).`,
            meta: { instructor_id: instructorId, total_minutes: totalMinutes, max_minutes: cfg.maxDailyInstructorMinutes },
          });
        }
      }
    }

    // Type 6: Instructor Availability (HIGH) - month-scoped allow-list; no entries => no enforcement
    if (cfg.scheduleMonth && availabilityIndex.size > 0) {
      for (const ps of dateSessions) {
        const startMin = ps.startMin;
        const endMin = ps.endMin;
        const day = normalizeDayOfWeek(ps.s.day_of_week);
        if (!day) continue;

        for (const instructorId of ps.s.instructor_ids) {
          const byDay = availabilityIndex.get(instructorId);
          if (!byDay) continue; // no entries for this instructor+month => no enforcement

          const windows = byDay.get(day) ?? [];
          const covered = windows.some((w) => startMin >= w.startMin && endMin <= w.endMin);
          if (!covered) {
            const allowed = windows
              .map((w) => `${w.start}–${w.end}`)
              .join(", ");
            conflicts.push({
              type: "INSTRUCTOR_OUTSIDE_AVAILABILITY",
              severity: "HIGH",
              date,
              session_a_id: ps.s.id,
              message:
                windows.length === 0
                  ? `Instructor is not available on ${day} for ${cfg.scheduleMonth} (no availability windows defined for this day).`
                  : `Instructor is not available during ${ps.s.start_time}–${ps.s.end_time} (allowed: ${allowed}).`,
              meta: {
                instructor_id: instructorId,
                schedule_month: cfg.scheduleMonth,
                day_of_week: day,
                allowed_windows: windows.map((w) => ({ start: w.start, end: w.end })),
              },
            });
          }
        }
      }
    }
  }

  return conflicts;
}


