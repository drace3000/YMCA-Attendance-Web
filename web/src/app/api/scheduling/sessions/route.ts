import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import {
  detectScheduleConflicts,
  type ScheduleConflict,
  type SessionForConflicts,
  type InstructorAvailability,
} from "@/lib/scheduling/conflict-engine";

type HolidayForConflicts = {
  holiday_date: string;
  observed_date?: string | null;
  name: string;
  is_closed?: boolean;
  closed_start_time?: string | null;
  closed_end_time?: string | null;
};

type SlotHelperHoldRow = {
  id: string;
  branch_id: string;
  schedule_id: string;
  class_id: string | null;
  location_id: string;
  instructor_ids: string[];
  slot_date: string;
  start_time: string;
  end_time: string;
  transition_minutes: number | null;
  turnover_minutes: number | null;
  expires_at: string;
  released_at: string | null;
  consumed_at: string | null;
};

type SessionRow = {
  id: string;
  branch_id: string;
  schedule_id: string;
  class_id: string;
  location_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  created_at?: string | null;
  headcount: number | null;
  class: { id: string; name: string } | { id: string; name: string }[] | null;
  location: { id: string; code: string; name: string } | { id: string; code: string; name: string }[] | null;
  instructors?: { id: string; nickname: string; first_name: string; last_name: string; readable_id: string | null }[];
};

type CreateSessionPayload = {
  branch_id: string;
  schedule_id: string;
  class_id: string;
  location_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  instructor_ids: string[];
  hold_id?: string | null;
};

type UpdateSessionPayload = {
  id: string;
  class_id?: string;
  location_id?: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
  session_date?: string;
  instructor_ids?: string[];
  headcount?: number | null;
};

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

async function validateInstructorsForBranch(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  branchId: string,
  instructorIds: string[],
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const ids = instructorIds.filter(Boolean);
  if (ids.length === 0) return { ok: true };

  const [
    { data: instructorRows, error: instError },
    { data: linkRows, error: linkError },
  ] = await Promise.all([
    supabase.from("instructors").select("id, branch_id").in("id", ids),
    supabase
      .from("instructor_branches")
      .select("instructor_id")
      .eq("branch_id", branchId)
      .in("instructor_id", ids),
  ]);

  if (instError) return { ok: false, status: 500, error: instError.message };
  if (linkError) return { ok: false, status: 500, error: linkError.message };

  const owned = new Set(
    (instructorRows ?? [])
      .filter((r: { id: string; branch_id: string | null }) => r.branch_id === branchId)
      .map((r: { id: string }) => r.id),
  );
  const linked = new Set(
    (linkRows ?? [])
      .map((r: { instructor_id: string }) => r.instructor_id)
      .filter(Boolean),
  );

  const allowed = new Set<string>([...owned, ...linked]);
  const invalid = ids.filter((id) => !allowed.has(id));

  if (invalid.length > 0) {
    return {
      ok: false,
      status: 409,
      error: "Selected instructor is not available for this branch",
    };
  }

  return { ok: true };
}

type ConflictSessionRow = {
  id: string;
  schedule_id: string;
  branch_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  location_id: string;
};

async function fetchInstructorIdsBySessionId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  sessionIds: string[],
): Promise<Record<string, string[]>> {
  if (sessionIds.length === 0) return {};

  const { data, error } = await supabase
    .from("session_instructors")
    .select("session_id, instructor_id")
    .in("session_id", sessionIds);

  if (error) throw new Error(error.message);

  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as Array<{ session_id: string; instructor_id: string }>) {
    if (!row.session_id || !row.instructor_id) continue;
    if (!map[row.session_id]) map[row.session_id] = [];
    map[row.session_id].push(row.instructor_id);
  }
  return map;
}

async function fetchSessionsForConflictCheck(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  scheduleId: string;
  sessionDate: string;
  excludeSessionId?: string;
}): Promise<SessionForConflicts[]> {
  const { supabase, branchId, scheduleId, sessionDate, excludeSessionId } = opts;

  let query = supabase
    .from("class_sessions")
    .select("id, schedule_id, branch_id, day_of_week, start_time, end_time, session_date, location_id")
    .eq("branch_id", branchId)
    .eq("schedule_id", scheduleId)
    .eq("session_date", sessionDate);

  if (excludeSessionId) query = query.neq("id", excludeSessionId);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const typedRows = (rows ?? []) as unknown as ConflictSessionRow[];
  const ids = typedRows.map((r) => r.id).filter(Boolean);
  const instructorMap = await fetchInstructorIdsBySessionId(supabase, ids);

  return typedRows.map((r) => ({
    id: r.id,
    day_of_week: r.day_of_week,
    session_date: r.session_date,
    start_time: r.start_time,
    end_time: r.end_time,
    location_id: r.location_id,
    location_code: null,
    class_name: null,
    instructor_ids: instructorMap[r.id] ?? [],
  }));
}

async function fetchSlotHelperHoldsForConflictCheck(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  scheduleId: string;
  sessionDate: string;
  excludeHoldId?: string | null;
}): Promise<SessionForConflicts[]> {
  const { supabase, branchId, scheduleId, sessionDate, excludeHoldId } = opts;
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("slot_helper_slot_holds")
    .select(
      "id, class_id, location_id, instructor_ids, slot_date, start_time, end_time, transition_minutes, turnover_minutes, expires_at, released_at, consumed_at",
    )
    .eq("branch_id", branchId)
    .eq("schedule_id", scheduleId)
    .eq("slot_date", sessionDate)
    .gt("expires_at", nowIso)
    .is("released_at", null)
    .is("consumed_at", null);

  if (excludeHoldId) query = query.neq("id", excludeHoldId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SlotHelperHoldRow[];
  return rows.map((r) => {
    const buffered = applyHoldBuffer({
      start_time: r.start_time,
      end_time: r.end_time,
      transition_minutes: r.transition_minutes,
      turnover_minutes: r.turnover_minutes,
    });
    return {
      id: `hold:${r.id}`,
      day_of_week: dayOfWeekFromIsoDateUtc(r.slot_date),
      session_date: r.slot_date,
      start_time: buffered.start_time,
      end_time: buffered.end_time,
      class_name: r.class_id ? "Slot hold" : null,
      location_code: null,
      location_id: r.location_id,
      instructor_ids: Array.isArray(r.instructor_ids) ? r.instructor_ids : [],
    };
  });
}

async function fetchInstructorAvailabilityForConflictCheck(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  instructorIds: string[];
  scheduleMonth?: string;
}): Promise<InstructorAvailability[]> {
  const { supabase, branchId, instructorIds, scheduleMonth } = opts;
  const ids = instructorIds.filter(Boolean);
  if (ids.length === 0) return [];

  if (!scheduleMonth) return []; // month-scoped allow-list; without a month we do not enforce

  // Avoid .or/.gte/.lte to keep API tests' Supabase mocks simple.
  const { data, error } = await supabase
    .from("instructor_availability")
    .select("instructor_id, schedule_month, day_of_week, available_start, available_end")
    .eq("branch_id", branchId)
    .eq("schedule_month", scheduleMonth)
    .in("instructor_id", ids);

  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((r) => ({
    instructor_id: String(r.instructor_id),
    schedule_month: String(r.schedule_month),
    day_of_week: String(r.day_of_week),
    available_start: String(r.available_start).slice(0, 5),
    available_end: String(r.available_end).slice(0, 5),
  }));
}

async function fetchHolidaysForConflictCheck(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  scheduleMonth?: string;
}): Promise<HolidayForConflicts[]> {
  const { supabase, branchId, scheduleMonth } = opts;
  if (!scheduleMonth) return [];

  const { data, error } = await supabase
    .from("holidays")
    .select("holiday_date, observed_date, name, is_closed, closed_start_time, closed_end_time")
    .eq("branch_id", branchId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? (data as any[]) : [];
  return rows
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
}

function blockingConflictsForSession(
  allConflicts: ScheduleConflict[],
  sessionId: string,
): ScheduleConflict[] {
  return allConflicts.filter(
    (c) =>
      c.severity === "HIGH" &&
      (c.session_a_id === sessionId || c.session_b_id === sessionId),
  );
}

// GET - List sessions for a schedule and branch
export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const scheduleId = searchParams.get("schedule_id");
  const requestedBranchId = searchParams.get("branch_id");

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;

  if (!scheduleId || !branchId) {
    return NextResponse.json(
      { error: "schedule_id and branch_id are required" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  // Fetch sessions with class and location info
  const { data: sessions, error: sessionsError } = await supabase
    .from("class_sessions")
    .select(`
      id,
      branch_id,
      schedule_id,
      class_id,
      location_id,
      day_of_week,
      start_time,
      end_time,
      session_date,
      created_at,
      headcount,
      class:class_id(id, name),
      location:locations!class_sessions_branch_location_fkey(id, code, name)
    `)
    .eq("schedule_id", scheduleId)
    .eq("branch_id", branchId)
    .order("day_of_week")
    .order("start_time");

  if (sessionsError) {
    return NextResponse.json({ error: sessionsError.message }, { status: 500 });
  }

  // Fetch instructor assignments for all sessions (batch to avoid URI too long)
  const sessionIds = (sessions || []).map((s: { id: string }) => s.id);
  
  let instructorMap: Record<
    string,
    { id: string; nickname: string; first_name: string; last_name: string; readable_id: string | null }[]
  > = {};
  
  if (sessionIds.length > 0) {
    // Batch session IDs to avoid URI too long error
    const BATCH_SIZE = 50;
    const batches: string[][] = [];
    for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
      batches.push(sessionIds.slice(i, i + BATCH_SIZE));
    }

    // Fetch all batches in parallel
    const batchResults = await Promise.all(
      batches.map(batch =>
        supabase
          .from("session_instructors")
          .select(`
            session_id,
            instructor:instructor_id(id, nickname, first_name, last_name, readable_id)
          `)
          .in("session_id", batch)
      )
    );

    // Process results from all batches
    for (const { data: instructorLinks, error: instructorError } of batchResults) {
      if (instructorError) {
        console.error("Error fetching instructors:", instructorError);
        continue;
      }
      
      // Group instructors by session_id
      for (const link of instructorLinks || []) {
        const sid = link.session_id;
        if (!instructorMap[sid]) {
          instructorMap[sid] = [];
        }
        if (link.instructor) {
          const inst = Array.isArray(link.instructor) ? link.instructor[0] : link.instructor;
          if (inst) {
            instructorMap[sid].push(inst);
          }
        }
      }
    }
  }

  // Merge instructors into sessions
  const enrichedSessions = (sessions || []).map((session: SessionRow) => ({
    ...session,
    instructors: instructorMap[session.id] || [],
  }));

  return NextResponse.json({ sessions: enrichedSessions });
}

// POST - Create a new session
export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: CreateSessionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    branch_id: requestedBranchId,
    schedule_id,
    class_id,
    location_id,
    day_of_week,
    start_time,
    end_time,
    session_date,
    instructor_ids,
    hold_id,
  } = body;

  const access = required.access;
  const branch_id =
    access?.recipient_type === "Branch" && access
      ? access.branch_id
      : requestedBranchId ?? access?.branch_id ?? null;

  if (!branch_id) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  if (!schedule_id || !class_id || !location_id || !day_of_week || !start_time || !end_time || !session_date) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();

  // Ensure the selected schedule belongs to this branch.
  {
    const { data: scheduleRow, error: scheduleError } = await supabase
      .from("schedules")
      .select("id, month_start, is_approved")
      .eq("id", schedule_id)
      .eq("branch_id", branch_id)
      .maybeSingle();

    if (scheduleError) {
      return NextResponse.json({ error: scheduleError.message }, { status: 500 });
    }

    if (!scheduleRow) {
      return NextResponse.json(
        { error: "Selected schedule is not available for this branch" },
        { status: 409 }
      );
    }

    if ((scheduleRow as { is_approved?: boolean | null }).is_approved === false) {
      return NextResponse.json(
        { error: "Schedule is pending approval; no changes are allowed until approved" },
        { status: 409 },
      );
    }

    const scheduleMonth =
      typeof (scheduleRow as unknown as { month_start?: string | null }).month_start === "string"
        ? (scheduleRow as unknown as { month_start: string }).month_start.slice(0, 7)
        : undefined;

    // Save for conflict checks later (same closure scope)
    (req as any).__scheduleMonth = scheduleMonth;
  }

  // Ensure the selected class belongs to this branch.
  {
    const { data: classRow, error: classError } = await supabase
      .from("classes")
      .select("id")
      .eq("id", class_id)
      .eq("branch_id", branch_id)
      .maybeSingle();

    if (classError) {
      return NextResponse.json({ error: classError.message }, { status: 500 });
    }

    if (!classRow) {
      return NextResponse.json(
        { error: "Selected class is not available for this branch" },
        { status: 409 }
      );
    }
  }

  // Ensure the selected location belongs to this branch (friendly error vs DB constraint failure).
  {
    const { data: locationRow, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("id", location_id)
      .eq("branch_id", branch_id)
      .maybeSingle();

    if (locationError) {
      return NextResponse.json({ error: locationError.message }, { status: 500 });
    }

    if (!locationRow) {
      return NextResponse.json(
        { error: "Selected location is not available for this branch" },
        { status: 409 }
      );
    }
  }

  // Ensure selected instructors (if any) are available for this branch.
  if (instructor_ids && instructor_ids.length > 0) {
    const validation = await validateInstructorsForBranch(supabase, branch_id, instructor_ids);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }
  }

  const holdId = typeof hold_id === "string" ? hold_id.trim() : null;
  if (holdId) {
    const { data: holdRow, error: holdErr } = await supabase
      .from("slot_helper_slot_holds")
      .select(
        "id, branch_id, schedule_id, class_id, location_id, instructor_ids, slot_date, start_time, end_time, expires_at, released_at, consumed_at",
      )
      .eq("id", holdId)
      .eq("branch_id", branch_id)
      .eq("schedule_id", schedule_id)
      .maybeSingle<SlotHelperHoldRow>();

    if (holdErr || !holdRow) {
      return NextResponse.json({ error: "Selected slot hold is not available." }, { status: 409 });
    }

    const nowMs = Date.now();
    const expiresMs = new Date(holdRow.expires_at).getTime();
    if (!Number.isFinite(expiresMs) || nowMs > expiresMs || holdRow.released_at || holdRow.consumed_at) {
      return NextResponse.json({ error: "Selected slot hold has expired." }, { status: 409 });
    }

    const holdSlotDate = String(holdRow.slot_date);
    const holdStart = String(holdRow.start_time).slice(0, 5);
    const holdEnd = String(holdRow.end_time).slice(0, 5);
    const holdLocation = String(holdRow.location_id ?? "").trim();
    const holdClass = holdRow.class_id ? String(holdRow.class_id).trim() : null;
    const holdInstructors = Array.isArray(holdRow.instructor_ids) ? holdRow.instructor_ids : [];

    if (holdSlotDate !== session_date || holdStart !== start_time || holdEnd !== end_time || holdLocation !== location_id) {
      return NextResponse.json({ error: "Selected slot hold does not match the session details." }, { status: 409 });
    }
    if (holdClass && holdClass !== class_id) {
      return NextResponse.json({ error: "Selected slot hold does not match the chosen class." }, { status: 409 });
    }
    if (instructor_ids && instructor_ids.some((id) => !holdInstructors.includes(id))) {
      return NextResponse.json({ error: "Selected slot hold does not include all chosen instructors." }, { status: 409 });
    }
  }

  // HIGH conflict enforcement (server-side gate)
  {
    const scheduleMonth = (req as any).__scheduleMonth as string | undefined;
    const existing = await fetchSessionsForConflictCheck({
      supabase,
      branchId: branch_id,
      scheduleId: schedule_id,
      sessionDate: session_date,
    });
    const holds = await fetchSlotHelperHoldsForConflictCheck({
      supabase,
      branchId: branch_id,
      scheduleId: schedule_id,
      sessionDate: session_date,
      excludeHoldId: holdId,
    });

    const CANDIDATE_ID = "__candidate__";
    const candidate: SessionForConflicts = {
      id: CANDIDATE_ID,
      day_of_week: day_of_week.toUpperCase(),
      session_date,
      start_time,
      end_time,
      location_id,
      location_code: null,
      class_name: null,
      instructor_ids: instructor_ids ?? [],
    };

    const instructorAvailability = await fetchInstructorAvailabilityForConflictCheck({
      supabase,
      branchId: branch_id,
      instructorIds: instructor_ids ?? [],
      scheduleMonth,
    });

    const holidays = await fetchHolidaysForConflictCheck({
      supabase,
      branchId: branch_id,
      scheduleMonth,
    });

    const all = detectScheduleConflicts([...existing, ...holds, candidate], {
      scheduleMonth,
      instructorAvailability,
      holidays,
      // Only block HIGH on save; warnings will be surfaced in Phase 3 UI.
      enableTransitionWarnings: false,
      enableTurnoverWarnings: false,
      enableMaxHoursWarnings: false,
    });

    const blocking = blockingConflictsForSession(all, CANDIDATE_ID);
    if (blocking.length > 0) {
      return NextResponse.json(
        { error: "Schedule conflict(s) detected", conflicts: blocking },
        { status: 409 },
      );
    }
  }

  // Insert the session
  const { data: session, error: sessionError } = await supabase
    .from("class_sessions")
    .insert({
      branch_id,
      schedule_id,
      class_id,
      location_id,
      day_of_week: day_of_week.toUpperCase(),
      start_time,
      end_time,
      session_date,
      effective_month: session_date.substring(0, 7) + "-01",
    })
    .select()
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // Insert instructor assignments
  if (instructor_ids && instructor_ids.length > 0) {
    const instructorLinks = instructor_ids.map((instructor_id) => ({
      session_id: session.id,
      instructor_id,
    }));

    const { error: linkError } = await supabase
      .from("session_instructors")
      .insert(instructorLinks);

    if (linkError) {
      // Session was created but instructor linking failed - return warning
      return NextResponse.json(
        { session, warning: `Session created but instructor linking failed: ${linkError.message}` },
        { status: 201 }
      );
    }
  }

  if (holdId) {
    const { error: consumeErr } = await supabase
      .from("slot_helper_slot_holds")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", holdId)
      .is("consumed_at", null);
    if (consumeErr) {
      return NextResponse.json(
        { session, warning: `Session created, but failed to consume slot hold: ${consumeErr.message}` },
        { status: 201 },
      );
    }
  }

  return NextResponse.json({ session }, { status: 201 });
}

// PUT - Update a session
export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const access = required.access;
  let body: UpdateSessionPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, instructor_ids, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Load current session row (needed for conflict checks + admin branch scoping)
  const { data: currentSession, error: currentSessionError } = await supabase
    .from("class_sessions")
    .select("id, branch_id, schedule_id, day_of_week, start_time, end_time, session_date, location_id")
    .eq("id", id)
    .single<{
      id: string;
      branch_id: string;
      schedule_id: string;
      day_of_week: string;
      start_time: string;
      end_time: string;
      session_date: string;
      location_id: string;
    }>();

  if (currentSessionError) {
    return NextResponse.json({ error: currentSessionError.message }, { status: 500 });
  }
  if (!currentSession?.id) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (access?.recipient_type === "Branch" && currentSession.branch_id !== access.branch_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Approval lock: block edits to sessions when the schedule is pending approval.
  {
    const { data: scheduleRow, error: scheduleError } = await supabase
      .from("schedules")
      .select("id, is_approved")
      .eq("id", currentSession.schedule_id)
      .eq("branch_id", currentSession.branch_id)
      .maybeSingle<{ id: string; is_approved: boolean }>();

    if (scheduleError) {
      return NextResponse.json({ error: scheduleError.message }, { status: 500 });
    }

    if (!scheduleRow) {
      return NextResponse.json({ error: "Selected schedule is not available for this branch" }, { status: 409 });
    }

    if (scheduleRow.is_approved === false) {
      return NextResponse.json(
        { error: "Schedule is pending approval; no changes are allowed until approved" },
        { status: 409 },
      );
    }
  }

  const getEffectiveBranchIdForSession = async (): Promise<
    { ok: true; branchId: string } | { ok: false; status: number; error: string }
  > => {
    if (access?.recipient_type === "Branch") {
      return { ok: true, branchId: access.branch_id };
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("class_sessions")
      .select("branch_id")
      .eq("id", id)
      .single();

    if (sessionError) return { ok: false, status: 500, error: sessionError.message };
    if (!sessionRow?.branch_id) return { ok: false, status: 404, error: "Session not found" };

    return { ok: true, branchId: sessionRow.branch_id };
  };

  // HIGH conflict enforcement (server-side gate) for updates that affect conflicts
  {
    const affectsConflicts =
      updates.day_of_week !== undefined ||
      updates.start_time !== undefined ||
      updates.end_time !== undefined ||
      updates.session_date !== undefined ||
      updates.location_id !== undefined ||
      instructor_ids !== undefined;

    if (affectsConflicts) {
      const effectiveBranchId = currentSession.branch_id;
      const scheduleId = currentSession.schedule_id;

      const nextSessionDate = updates.session_date ?? currentSession.session_date;
      const nextDayOfWeek = (updates.day_of_week ?? currentSession.day_of_week).toUpperCase();
      const nextStart = updates.start_time ?? currentSession.start_time;
      const nextEnd = updates.end_time ?? currentSession.end_time;
      const nextLocationId = updates.location_id ?? currentSession.location_id;

      const nextInstructorIds =
        instructor_ids !== undefined
          ? instructor_ids
          : (await fetchInstructorIdsBySessionId(supabase, [id]))[id] ?? [];

      // Resolve schedule month for month-bound validations
      const { data: scheduleRow, error: scheduleError } = await supabase
        .from("schedules")
        .select("id, month_start")
        .eq("id", scheduleId)
        .eq("branch_id", effectiveBranchId)
        .maybeSingle<{ id: string; month_start: string }>();

      if (scheduleError) {
        return NextResponse.json({ error: scheduleError.message }, { status: 500 });
      }
      if (!scheduleRow) {
        return NextResponse.json(
          { error: "Selected schedule is not available for this branch" },
          { status: 409 },
        );
      }

      const scheduleMonth =
        typeof scheduleRow.month_start === "string"
          ? scheduleRow.month_start.slice(0, 7)
          : undefined;

      const others = await fetchSessionsForConflictCheck({
        supabase,
        branchId: effectiveBranchId,
        scheduleId,
        sessionDate: nextSessionDate,
        excludeSessionId: id,
      });
      const holds = await fetchSlotHelperHoldsForConflictCheck({
        supabase,
        branchId: effectiveBranchId,
        scheduleId,
        sessionDate: nextSessionDate,
      });

      const candidate: SessionForConflicts = {
        id,
        day_of_week: nextDayOfWeek,
        session_date: nextSessionDate,
        start_time: nextStart,
        end_time: nextEnd,
        location_id: nextLocationId,
        location_code: null,
        class_name: null,
        instructor_ids: nextInstructorIds ?? [],
      };

      const instructorAvailability = await fetchInstructorAvailabilityForConflictCheck({
        supabase,
        branchId: effectiveBranchId,
        instructorIds: nextInstructorIds ?? [],
        scheduleMonth,
      });

      const holidays = await fetchHolidaysForConflictCheck({
        supabase,
        branchId: effectiveBranchId,
        scheduleMonth,
      });

      const all = detectScheduleConflicts([...others, ...holds, candidate], {
        scheduleMonth,
        instructorAvailability,
        holidays,
        enableTransitionWarnings: false,
        enableTurnoverWarnings: false,
        enableMaxHoursWarnings: false,
      });

      const blocking = blockingConflictsForSession(all, id);
      if (blocking.length > 0) {
        return NextResponse.json(
          { error: "Schedule conflict(s) detected", conflicts: blocking },
          { status: 409 },
        );
      }
    }
  }

  // Friendly validation: if updating class_id, ensure it belongs to the session's branch.
  if (updates.class_id !== undefined) {
    const branchRes = await getEffectiveBranchIdForSession();
    if (!branchRes.ok) {
      return NextResponse.json({ error: branchRes.error }, { status: branchRes.status });
    }
    const effectiveBranchId = branchRes.branchId;

    const { data: classRow, error: classError } = await supabase
      .from("classes")
      .select("id")
      .eq("id", updates.class_id)
      .eq("branch_id", effectiveBranchId)
      .maybeSingle();

    if (classError) {
      return NextResponse.json({ error: classError.message }, { status: 500 });
    }

    if (!classRow) {
      return NextResponse.json(
        { error: "Selected class is not available for this branch" },
        { status: 409 }
      );
    }
  }

  // Friendly validation: if updating location_id, ensure it belongs to the session's branch.
  if (updates.location_id !== undefined) {
    const branchRes = await getEffectiveBranchIdForSession();
    if (!branchRes.ok) {
      return NextResponse.json({ error: branchRes.error }, { status: branchRes.status });
    }
    const effectiveBranchId = branchRes.branchId;

    const { data: locationRow, error: locationError } = await supabase
      .from("locations")
      .select("id")
      .eq("id", updates.location_id)
      .eq("branch_id", effectiveBranchId)
      .maybeSingle();

    if (locationError) {
      return NextResponse.json({ error: locationError.message }, { status: 500 });
    }

    if (!locationRow) {
      return NextResponse.json(
        { error: "Selected location is not available for this branch" },
        { status: 409 }
      );
    }
  }

  // Update session fields if any
  if (Object.keys(updates).length > 0) {
    const updateData: Record<string, unknown> = { ...updates };
    if (updates.day_of_week) {
      updateData.day_of_week = updates.day_of_week.toUpperCase();
    }

    let updateQuery = supabase
      .from("class_sessions")
      .update(updateData)
      .eq("id", id);

    if (access?.recipient_type === "Branch") {
      updateQuery = updateQuery.eq("branch_id", access.branch_id);
    }

    const { error: updateError } = await updateQuery;

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  // Update instructor assignments if provided
  if (instructor_ids !== undefined) {
    const branchRes = await getEffectiveBranchIdForSession();
    if (!branchRes.ok) {
      return NextResponse.json({ error: branchRes.error }, { status: branchRes.status });
    }

    if (instructor_ids.length > 0) {
      const validation = await validateInstructorsForBranch(
        supabase,
        branchRes.branchId,
        instructor_ids,
      );
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: validation.status });
      }
    }

    // Delete existing assignments
    // (Instructor links are scoped to the session_id; branch scoping is enforced above.)
    const { error: deleteError } = await supabase
      .from("session_instructors")
      .delete()
      .eq("session_id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to update instructors: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Insert new assignments
    if (instructor_ids.length > 0) {
      const instructorLinks = instructor_ids.map((instructor_id) => ({
        session_id: id,
        instructor_id,
      }));

      const { error: linkError } = await supabase
        .from("session_instructors")
        .insert(instructorLinks);

      if (linkError) {
        return NextResponse.json(
          { error: `Failed to link instructors: ${linkError.message}` },
          { status: 500 }
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE - Delete a session
export async function DELETE(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const access = required.access;

  // Approval lock: prevent deletion when the schedule is pending approval.
  {
    let sessionQuery = supabase
      .from("class_sessions")
      .select("id, branch_id, schedule_id")
      .eq("id", id);

    if (access?.recipient_type === "Branch") {
      sessionQuery = sessionQuery.eq("branch_id", access.branch_id);
    }

    const { data: sessionRow, error: sessionError } = await sessionQuery.maybeSingle<{
      id: string;
      branch_id: string;
      schedule_id: string;
    }>();

    if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });
    if (!sessionRow) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const { data: scheduleRow, error: scheduleError } = await supabase
      .from("schedules")
      .select("id, is_approved")
      .eq("id", sessionRow.schedule_id)
      .eq("branch_id", sessionRow.branch_id)
      .maybeSingle<{ id: string; is_approved: boolean }>();

    if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });
    if (!scheduleRow) {
      return NextResponse.json({ error: "Selected schedule is not available for this branch" }, { status: 409 });
    }
    if (scheduleRow.is_approved === false) {
      return NextResponse.json(
        { error: "Schedule is pending approval; no changes are allowed until approved" },
        { status: 409 },
      );
    }
  }

  // session_instructors will be deleted via CASCADE
  let delQuery = supabase
    .from("class_sessions")
    .delete()
    .eq("id", id);
  if (access?.recipient_type === "Branch") {
    delQuery = delQuery.eq("branch_id", access.branch_id);
  }

  const { error } = await delQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}