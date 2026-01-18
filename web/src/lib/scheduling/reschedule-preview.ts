import type { InstructorAvailability, SessionForConflicts } from "@/lib/scheduling/conflict-engine";

export type DragOffset = { x: number; y: number };

export type RescheduleProposal =
  | {
      date: string; // YYYY-MM-DD
      start_time: string; // HH:mm
      end_time: string; // HH:mm
    }
  | { reason: string };

export type ReschedulePreviewResult = {
  session_id: string;
  proposal: RescheduleProposal;
};

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

function dayOfWeekFromIsoDateUtc(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const name = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return String(name || "").trim().toUpperCase() || null;
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

type AvailabilityWindow = { startMin: number; endMin: number };

function buildAvailabilityIndex(
  scheduleMonth: string,
  targetInstructorId: string,
  availability: InstructorAvailability[],
): Map<string, AvailabilityWindow[]> {
  // day_of_week (MONDAY) -> windows
  const map = new Map<string, AvailabilityWindow[]>();
  for (const r of availability) {
    if (!r?.instructor_id) continue;
    if (r.instructor_id !== targetInstructorId) continue;
    if (r.schedule_month !== scheduleMonth) continue;

    const day = String(r.day_of_week ?? "").trim().toUpperCase();
    const startMin = parseHHmmToMinutes(r.available_start);
    const endMin = parseHHmmToMinutes(r.available_end);
    if (!day || startMin === null || endMin === null || endMin <= startMin) continue;

    const list = map.get(day) ?? [];
    list.push({ startMin, endMin });
    map.set(day, list);
  }

  // Deterministic: sort windows by start time
  for (const [day, list] of map.entries()) {
    list.sort((a, b) => a.startMin - b.startMin);
    map.set(day, list);
  }

  return map;
}

export function buildReschedulePreview(opts: {
  scheduleMonth: string; // YYYY-MM
  targetInstructorId: string;
  relatedSessionIds: string[]; // sessions to reschedule preview (includes current)
  sessions: SessionForConflicts[]; // all sessions in current schedule scope
  instructorAvailability: InstructorAvailability[]; // month-scoped rows
  stepMinutes?: number; // default 15
}): ReschedulePreviewResult[] {
  const { scheduleMonth, targetInstructorId, relatedSessionIds, sessions, instructorAvailability } = opts;
  const step = Number.isFinite(opts.stepMinutes) ? Math.max(5, Math.floor(opts.stepMinutes ?? 15)) : 15;

  const sessionsById = new Map(sessions.map((s) => [s.id, s] as const));
  const related = relatedSessionIds.map((id) => sessionsById.get(id)).filter(Boolean) as SessionForConflicts[];

  if (related.length === 0) return [];

  const availabilityIndex = buildAvailabilityIndex(scheduleMonth, targetInstructorId, instructorAvailability);
  if (availabilityIndex.size === 0) {
    return related.map((s) => ({
      session_id: s.id,
      proposal: { reason: "No availability windows defined for this instructor/month." },
    }));
  }

  // Pre-index sessions by date for quick overlap checks.
  const datesInMonth = listDatesForMonth(scheduleMonth);
  const sessionsByDate = new Map<
    string,
    Array<{ id: string; startMin: number; endMin: number; location_id: string | null; instructor_ids: string[] }>
  >();

  for (const s of sessions) {
    if (!s?.id || !s.session_date || !s.session_date.startsWith(scheduleMonth)) continue;
    const startMin = parseHHmmToMinutes(s.start_time);
    const endMin = parseHHmmToMinutes(s.end_time);
    if (startMin === null || endMin === null || endMin <= startMin) continue;

    const list = sessionsByDate.get(s.session_date) ?? [];
    list.push({
      id: s.id,
      startMin,
      endMin,
      location_id: s.location_id ? String(s.location_id) : null,
      instructor_ids: Array.isArray(s.instructor_ids) ? s.instructor_ids : [],
    });
    sessionsByDate.set(s.session_date, list);
  }

  // Deterministic ordering: sort related sessions by date then start.
  const relatedSorted = [...related].sort((a, b) => {
    const ad = a.session_date.localeCompare(b.session_date);
    if (ad !== 0) return ad;
    return String(a.start_time).slice(0, 5).localeCompare(String(b.start_time).slice(0, 5));
  });

  const results: ReschedulePreviewResult[] = [];

  for (const s of relatedSorted) {
    const startMin = parseHHmmToMinutes(s.start_time);
    const endMin = parseHHmmToMinutes(s.end_time);
    if (startMin === null || endMin === null || endMin <= startMin) {
      results.push({ session_id: s.id, proposal: { reason: "Invalid session time." } });
      continue;
    }

    const duration = endMin - startMin;
    const locationId = s.location_id ? String(s.location_id) : null;

    let found: { date: string; startMin: number } | null = null;

    for (const date of datesInMonth) {
      const day = dayOfWeekFromIsoDateUtc(date);
      if (!day) continue;

      const windows = availabilityIndex.get(day) ?? [];
      if (windows.length === 0) continue;

      for (const w of windows) {
        const latestStart = w.endMin - duration;
        for (let candidateStart = w.startMin; candidateStart <= latestStart; candidateStart += step) {
          const candidateEnd = candidateStart + duration;

          const existing = sessionsByDate.get(date) ?? [];
          const ok = existing.every((ex) => {
            if (ex.id === s.id) return true; // ignore self
            if (!overlaps(candidateStart, candidateEnd, ex.startMin, ex.endMin)) return true;
            const sameInstructor = ex.instructor_ids.includes(targetInstructorId);
            const sameLocation = !!locationId && !!ex.location_id && ex.location_id === locationId;
            return !(sameInstructor || sameLocation);
          });

          if (ok) {
            found = { date, startMin: candidateStart };
            break;
          }
        }
        if (found) break;
      }
      if (found) break;
    }

    if (!found) {
      results.push({ session_id: s.id, proposal: { reason: "No viable slot found in availability windows." } });
      continue;
    }

    const proposedStart = minutesToHHmm(found.startMin);
    const proposedEnd = minutesToHHmm(found.startMin + duration);

    // Reserve the proposed slot so subsequent proposals don't collide with earlier ones.
    // This makes the preview list more realistic when rescheduling multiple sessions together.
    const reserveList = sessionsByDate.get(found.date) ?? [];
    reserveList.push({
      id: `__proposed__${s.id}`,
      startMin: found.startMin,
      endMin: found.startMin + duration,
      location_id: locationId,
      instructor_ids: [targetInstructorId],
    });
    sessionsByDate.set(found.date, reserveList);

    results.push({
      session_id: s.id,
      proposal: { date: found.date, start_time: proposedStart, end_time: proposedEnd },
    });
  }

  return results;
}


