import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import {
  detectScheduleConflicts,
  getDefaultConflictEngineConfig,
  type ScheduleConflict,
  type SessionForConflicts,
  type InstructorAvailability,
} from "@/lib/scheduling/conflict-engine";

type VerifyPayload = {
  schedule_id: string;
  branch_id?: string;
};

type ScheduleRow = { id: string; month_start: string };

type SessionRow = {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  location_id: string;
  class?: { name: string } | { name: string }[] | null;
  location?: { code: string } | { code: string }[] | null;
};

function normalizeRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parseHHmmToMinutes(hhmm: string): number | null {
  const v = String(hhmm ?? "").slice(0, 5);
  const m = /^(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToHHmm(min: number): string {
  const clamped = Math.min(24 * 60, Math.max(0, Math.floor(min)));
  const hh = Math.floor(clamped / 60);
  const mm = clamped % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dayOfWeekFromIsoDateUtc(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toUpperCase();
}

function applyHoldBuffer(opts: {
  start_time: string;
  end_time: string;
  transition_minutes: number | null;
  turnover_minutes: number | null;
}): { start_time: string; end_time: string } {
  const startMin = parseHHmmToMinutes(opts.start_time);
  const endMin = parseHHmmToMinutes(opts.end_time);
  if (startMin === null || endMin === null) {
    return { start_time: String(opts.start_time).slice(0, 5), end_time: String(opts.end_time).slice(0, 5) };
  }
  const buffer = Math.max(0, Number(opts.transition_minutes ?? 0), Number(opts.turnover_minutes ?? 0));
  return {
    start_time: minutesToHHmm(startMin - buffer),
    end_time: minutesToHHmm(endMin + buffer),
  };
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: VerifyPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scheduleId = (body.schedule_id ?? "").trim();
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  if (!scheduleId) return NextResponse.json({ error: "schedule_id is required" }, { status: 400 });

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  // Enforce branch users cannot verify other branches
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  // Load schedule month for month-bound validations
  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, month_start")
    .eq("id", scheduleId)
    .eq("branch_id", branchId)
    .maybeSingle<ScheduleRow>();

  if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  if (!scheduleRow) {
    return NextResponse.json(
      { error: "Selected schedule is not available for this branch" },
      { status: 409 },
    );
  }

  const scheduleMonth = scheduleRow.month_start.slice(0, 7);

  // Load sessions for schedule/branch
  const { data: sessions, error: sessionsError } = await supabase
    .from("class_sessions")
    .select(
      `
        id,
        day_of_week,
        start_time,
        end_time,
        session_date,
        location_id,
        class:class_id(name),
        location:locations!class_sessions_branch_location_fkey(code)
      `,
    )
    .eq("branch_id", branchId)
    .eq("schedule_id", scheduleId)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<SessionRow[]>();

  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 });

  const sessionIds = (sessions ?? []).map((s) => s.id).filter(Boolean);
  const instructorMap: Record<string, string[]> = {};

  if (sessionIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("session_instructors")
      .select("session_id, instructor_id")
      .in("session_id", sessionIds);

    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });

    for (const row of (links ?? []) as Array<{ session_id: string; instructor_id: string }>) {
      if (!row.session_id || !row.instructor_id) continue;
      if (!instructorMap[row.session_id]) instructorMap[row.session_id] = [];
      instructorMap[row.session_id].push(row.instructor_id);
    }
  }

  const engineSessions: SessionForConflicts[] = (sessions ?? []).map((s) => ({
    id: s.id,
    day_of_week: s.day_of_week,
    session_date: s.session_date,
    start_time: s.start_time,
    end_time: s.end_time,
    location_id: s.location_id,
    location_code: normalizeRel(s.location)?.code ?? null,
    class_name: normalizeRel(s.class)?.name ?? null,
    instructor_ids: instructorMap[s.id] ?? [],
  }));

  const nowIso = new Date().toISOString();
  const { data: holdRows, error: holdError } = await supabase
    .from("slot_helper_slot_holds")
    .select(
      "id, class_id, location_id, instructor_ids, slot_date, start_time, end_time, transition_minutes, turnover_minutes, expires_at",
    )
    .eq("branch_id", branchId)
    .eq("schedule_id", scheduleId)
    .gt("expires_at", nowIso)
    .is("released_at", null)
    .is("consumed_at", null);

  if (holdError) return NextResponse.json({ error: holdError.message }, { status: 500 });

  const holdSessions: SessionForConflicts[] = (holdRows ?? []).map((r: any) => {
    const buffered = applyHoldBuffer({
      start_time: r.start_time,
      end_time: r.end_time,
      transition_minutes: r.transition_minutes,
      turnover_minutes: r.turnover_minutes,
    });
    return {
      id: `hold:${r.id}`,
      day_of_week: dayOfWeekFromIsoDateUtc(String(r.slot_date)),
      session_date: String(r.slot_date),
      start_time: buffered.start_time,
      end_time: buffered.end_time,
      location_id: String(r.location_id ?? ""),
      location_code: null,
      class_name: r.class_id ? "Slot hold" : null,
      instructor_ids: Array.isArray(r.instructor_ids) ? r.instructor_ids : [],
    };
  });

  engineSessions.push(...holdSessions);

  const instructorIds = Array.from(
    new Set(engineSessions.flatMap((s) => s.instructor_ids).filter(Boolean)),
  );

  let instructorAvailability: InstructorAvailability[] = [];
  if (instructorIds.length > 0) {
    const { data: rows, error: aError } = await supabase
      .from("instructor_availability")
      .select("instructor_id, schedule_month, day_of_week, available_start, available_end")
      .eq("branch_id", branchId)
      .eq("schedule_month", scheduleMonth)
      .in("instructor_id", instructorIds);

    if (aError) return NextResponse.json({ error: aError.message }, { status: 500 });

    instructorAvailability = ((rows ?? []) as any[]).map((r) => ({
      instructor_id: String(r.instructor_id),
      schedule_month: String(r.schedule_month),
      day_of_week: String(r.day_of_week),
      available_start: String(r.available_start).slice(0, 5),
      available_end: String(r.available_end).slice(0, 5),
    }));
  }

  // Holiday conflicts:
  // - MEDIUM warning when the branch is closed (full or partial window)
  // - LOW informational note when not closed ("this date is <Holiday Name>")
  const { data: holidayRows, error: holidayError } = await supabase
    .from("holidays")
    .select("holiday_date, observed_date, name, is_closed, closed_start_time, closed_end_time")
    .eq("branch_id", branchId)
    .eq("is_active", true);

  if (holidayError) return NextResponse.json({ error: holidayError.message }, { status: 500 });

  const holidays = ((holidayRows ?? []) as Array<{
    holiday_date: string;
    observed_date?: string | null;
    name: string;
    is_closed?: boolean;
    closed_start_time?: string | null;
    closed_end_time?: string | null;
  }>)
    .map((r) => ({
      holiday_date: String(r.holiday_date ?? "").slice(0, 10),
      observed_date: r.observed_date ? String(r.observed_date).slice(0, 10) : null,
      name: String(r.name ?? ""),
      is_closed: !!r.is_closed,
      closed_start_time: r.closed_start_time ? String(r.closed_start_time).slice(0, 5) : null,
      closed_end_time: r.closed_end_time ? String(r.closed_end_time).slice(0, 5) : null,
    }))
    .filter((h) => {
      const effective = String((h.observed_date ?? h.holiday_date) ?? "");
      return effective && effective.startsWith(scheduleMonth);
    });

  const conflicts = detectScheduleConflicts(engineSessions, {
    ...getDefaultConflictEngineConfig(),
    scheduleMonth,
    instructorAvailability,
    holidays,
  });

  const summary = conflicts.reduce(
    (acc, c) => {
      acc.total += 1;
      if (c.severity === "HIGH") acc.high += 1;
      if (c.severity === "MEDIUM") acc.medium += 1;
      if (c.severity === "LOW") acc.low += 1;
      return acc;
    },
    { total: 0, high: 0, medium: 0, low: 0 },
  );

  return NextResponse.json({
    schedule_id: scheduleId,
    branch_id: branchId,
    schedule_month: scheduleMonth,
    summary,
    conflicts: conflicts as ScheduleConflict[],
  });
}

