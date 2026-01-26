import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { loadUsFederalHolidaysJson, type UsHolidaysJson } from "@/lib/us-federal-holidays-source";
import {
  detectScheduleConflicts,
  getDefaultConflictEngineConfig,
  type SessionForConflicts,
  type InstructorAvailability,
  type ScheduleConflict,
} from "@/lib/scheduling/conflict-engine";
import {
  addMonthsIso,
  mapSessionDateToNextMonthByWeekdayOrdinal,
  monthPrefixFromMonthStart,
  weekdayFromIsoDateUtc,
} from "@/lib/scheduling/clone-utils";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ClonePayload = {
  branch_id?: string;
  program_group_id: string;
  override_missing_headcounts?: boolean;
};

type ScheduleRow = {
  id: string;
  name: string;
  month_start: string; // "YYYY-MM-DD"
  status: string;
  is_approved?: boolean;
  branch_id: string;
  program_group_id: string;
};

type SourceSessionRow = {
  id: string;
  class_id: string;
  location_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  session_date: string;
  headcount: number | null;
};

type CloneConstraintEventType =
  | "SKIPPED_MISSING_OCCURRENCE"
  | "SKIPPED_OUTSIDE_TARGET_MONTH"
  | "SKIPPED_DEDUPED"
  | "SKIPPED_CONSTRAINT_CONFLICT"
  | "SKIPPED_NO_INSTRUCTORS_AFTER_AVAILABILITY"
  | "MODIFIED_DROPPED_INSTRUCTORS";

type CloneConstraintEventInsert = {
  branch_id: string;
  program_group_id: string;
  source_schedule_id: string | null;
  target_schedule_id: string;
  event_type: CloneConstraintEventType;
  source_session_id: string | null;
  class_id: string | null;
  location_id: string | null;
  target_session_date: string | null; // date column
  target_day_of_week: string | null;
  target_start_time: string | null; // time column
  target_end_time: string | null; // time column
  details: Record<string, unknown>;
};

function monthNameYearFromMonthStart(monthStartIsoDate: string): string {
  const d = new Date(`${monthStartIsoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

type MissingHeadcountSessionRow = {
  id: string;
  session_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  headcount: number | null;
  class?: { name: string } | { name: string }[] | null;
  location?: { code: string } | { code: string }[] | null;
};

type MissingHeadcountSession = {
  id: string;
  session_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  class_name: string | null;
  location_code: string | null;
};

function normalizeRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  const size = Math.max(1, Math.floor(chunkSize));
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function isProdCloneHeadcountGateActive(req: NextRequest): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    req.headers.get("x-ymca-emulate-prod-clone-gate") === "1"
  );
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((value ?? "").trim());
}

function normalizeDayOfWeek(value: string): string {
  return String(value ?? "").trim().toUpperCase();
}

async function loadTargetMonthInstructorAvailability(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  instructorIds: string[];
  scheduleMonth: string; // "YYYY-MM"
}): Promise<InstructorAvailability[]> {
  const { supabase, branchId, instructorIds, scheduleMonth } = opts;
  const ids = Array.from(new Set(instructorIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const rows: InstructorAvailability[] = [];
  for (const chunk of chunkArray(ids, 150)) {
    const { data, error } = await supabase
      .from("instructor_availability")
      .select("instructor_id, schedule_month, day_of_week, available_start, available_end")
      .eq("branch_id", branchId)
      .eq("schedule_month", scheduleMonth)
      .in("instructor_id", chunk);
    if (error) throw new Error(error.message);

    for (const r of (data ?? []) as Array<{
      instructor_id: string;
      schedule_month: string;
      day_of_week: string;
      available_start: string;
      available_end: string;
    }>) {
      rows.push({
        instructor_id: String(r.instructor_id ?? ""),
        schedule_month: String(r.schedule_month ?? ""),
        day_of_week: String(r.day_of_week ?? ""),
        available_start: String(r.available_start ?? "").slice(0, 5),
        available_end: String(r.available_end ?? "").slice(0, 5),
      });
    }
  }

  return rows;
}

async function loadTargetMonthHolidays(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  scheduleMonth: string; // "YYYY-MM"
}): Promise<
  Array<{
    holiday_date: string;
    observed_date?: string | null;
    name: string;
    is_closed?: boolean;
    closed_start_time?: string | null;
    closed_end_time?: string | null;
  }>
> {
  const { supabase, branchId, scheduleMonth } = opts;
  const { data, error } = await supabase
    .from("holidays")
    .select("holiday_date, observed_date, name, is_closed, closed_start_time, closed_end_time")
    .eq("branch_id", branchId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{
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
}

function buildConstraintReason(conflicts: ScheduleConflict[]): string {
  if (conflicts.length === 0) return "Constraint conflict detected.";
  const holiday = conflicts.find((c) => c.type === "HOLIDAY" && c.severity === "HIGH");
  const high = conflicts.find((c) => c.severity === "HIGH");
  const medium = conflicts.find((c) => c.severity === "MEDIUM");
  const first = holiday ?? high ?? medium ?? conflicts[0];
  if (conflicts.length === 1) return first.message;
  return `${first.message} (+${conflicts.length - 1} more conflict${conflicts.length - 1 === 1 ? "" : "s"})`;
}
async function copyInstructorAvailabilityForTargetMonth(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  instructorIds: string[];
  sourceScheduleMonth: string; // "YYYY-MM"
  targetScheduleMonth: string; // "YYYY-MM"
}): Promise<{ insertedCount: number }> {
  const { supabase, branchId, instructorIds, sourceScheduleMonth, targetScheduleMonth } = opts;

  const uniqueInstructorIds = Array.from(new Set(instructorIds.filter(Boolean)));
  if (uniqueInstructorIds.length === 0) return { insertedCount: 0 };
  if (sourceScheduleMonth === targetScheduleMonth) return { insertedCount: 0 };

  type AvailabilityRow = {
    branch_id: string;
    instructor_id: string;
    schedule_month: string;
    day_of_week: string;
    available_start: string;
    available_end: string;
  };

  const sourceRows: AvailabilityRow[] = [];
  for (const chunk of chunkArray(uniqueInstructorIds, 150)) {
    const { data, error } = await supabase
      .from("instructor_availability")
      .select("branch_id, instructor_id, schedule_month, day_of_week, available_start, available_end")
      .eq("branch_id", branchId)
      .eq("schedule_month", sourceScheduleMonth)
      .in("instructor_id", chunk)
      .returns<AvailabilityRow[]>();
    if (error) throw new Error(error.message);
    sourceRows.push(...(data ?? []));
  }

  if (sourceRows.length === 0) return { insertedCount: 0 };

  // Insert missing only (never overwrite): compare against existing rows in target month.
  const existingKeys = new Set<string>();
  for (const chunk of chunkArray(uniqueInstructorIds, 150)) {
    const { data, error } = await supabase
      .from("instructor_availability")
      .select("instructor_id, day_of_week, available_start, available_end")
      .eq("branch_id", branchId)
      .eq("schedule_month", targetScheduleMonth)
      .in("instructor_id", chunk);
    if (error) throw new Error(error.message);

    for (const r of (data ?? []) as Array<{
      instructor_id: string;
      day_of_week: string;
      available_start: string;
      available_end: string;
    }>) {
      // Postgres may return time as HH:mm:ss; normalize to HH:mm to avoid false "missing" matches.
      const start = String(r.available_start ?? "").slice(0, 5);
      const end = String(r.available_end ?? "").slice(0, 5);
      existingKeys.add([r.instructor_id, normalizeDayOfWeek(r.day_of_week), start, end].join("|"));
    }
  }

  const rowsToInsert = sourceRows
    .map((r) => ({
      branch_id: branchId,
      instructor_id: r.instructor_id,
      schedule_month: targetScheduleMonth,
      day_of_week: normalizeDayOfWeek(r.day_of_week),
      available_start: String(r.available_start).slice(0, 5),
      available_end: String(r.available_end).slice(0, 5),
    }))
    .filter((r) => !existingKeys.has([r.instructor_id, r.day_of_week, r.available_start, r.available_end].join("|")));

  if (rowsToInsert.length === 0) return { insertedCount: 0 };

  // Avoid PostgREST "URI too long" by chunking large inserts.
  let insertedCount = 0;
  for (const chunk of chunkArray(rowsToInsert, 500)) {
    const { error } = await supabase.from("instructor_availability").insert(chunk);
    if (error) throw new Error(error.message);
    insertedCount += chunk.length;
  }

  return { insertedCount };
}

async function ensureUsFederalHolidaysForNewYearIfJanuary(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  targetMonthStart: string; // "YYYY-MM-DD"
}): Promise<{ insertedCount: number }> {
  const { supabase, branchId, targetMonthStart } = opts;
  const targetMonth = monthPrefixFromMonthStart(targetMonthStart); // "YYYY-MM"
  const isJanuary = targetMonth.endsWith("-01");
  if (!isJanuary) return { insertedCount: 0 };

  const year = Number(targetMonth.slice(0, 4));
  if (!Number.isFinite(year) || year < 1900 || year > 3000) return { insertedCount: 0 };

  // Load US federal holiday source (repo-level JSON).
  let json: UsHolidaysJson;
  try {
    json = await loadUsFederalHolidaysJson();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read holidays JSON";
    throw new Error(`Failed to load holiday source file: ${msg}`);
  }

  const rowsToInsert: Array<{
    branch_id: string;
    holiday_date: string;
    observed_date: string | null;
    name: string;
    notes: string | null;
    is_active: boolean;
    is_closed: boolean;
    closed_start_time: string | null;
    closed_end_time: string | null;
    import_source: string;
  }> = [];

  const expectedDates: string[] = [];
  for (const h of json.holidays ?? []) {
    const name = String(h?.name ?? "").trim();
    if (!name) continue;
    const entry = (h?.dates ?? {})[String(year)];
    if (!entry) continue;
    const date = String(entry.date ?? "").trim();
    const observed = String(entry.observed ?? "").trim();
    const observedDate = observed && isIsoDate(observed) ? observed : null;
    if (!isIsoDate(date)) continue;

    expectedDates.push(date);
    rowsToInsert.push({
      branch_id: branchId,
      holiday_date: date,
      observed_date: observedDate,
      name,
      notes: null,
      is_active: true,
      is_closed: false,
      closed_start_time: null,
      closed_end_time: null,
      import_source: "US_FEDERAL",
    });
  }

  const dedupedByDate = new Map<string, (typeof rowsToInsert)[number]>();
  for (const r of rowsToInsert) dedupedByDate.set(r.holiday_date, r);
  const deduped = Array.from(dedupedByDate.values());
  const candidateDates = Array.from(new Set(expectedDates));
  if (candidateDates.length === 0) return { insertedCount: 0 };

  const { data: existingRows, error: existingError } = await supabase
    .from("holidays")
    .select("holiday_date")
    .eq("branch_id", branchId)
    .in("holiday_date", candidateDates);
  if (existingError) throw new Error(existingError.message);

  const existingDates = new Set(
    (existingRows ?? [])
      .map((r: any) => String(r?.holiday_date ?? "").slice(0, 10))
      .filter((d: string) => isIsoDate(d)),
  );

  const finalRows = deduped.filter((r) => !existingDates.has(r.holiday_date));

  if (finalRows.length === 0) return { insertedCount: 0 };

  // Production safety: don't mutate holiday schedules automatically.
  if (process.env.NODE_ENV === "production") {
    throw new HttpError(
      409,
      `Holiday schedule for ${year} is missing for this branch. Import US federal holidays before cloning into January ${year}.`,
    );
  }

  const { error: insertError } = await supabase.from("holidays").insert(finalRows);
  if (insertError) throw new Error(insertError.message);

  return { insertedCount: finalRows.length };
}

function wantsSse(req: NextRequest): boolean {
  return (req.headers.get("accept") ?? "").includes("text/event-stream");
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: ClonePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const programGroupId = (body.program_group_id ?? "").trim();
  if (!programGroupId) return NextResponse.json({ error: "program_group_id is required" }, { status: 400 });

  const override = body.override_missing_headcounts === true;
  const prodGateActive = isProdCloneHeadcountGateActive(req);
  const stream = wantsSse(req);

  const access = required.access;
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();

  // 1) Load most recent schedule (source)
  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, name, month_start, status, is_approved, branch_id, program_group_id")
    .eq("branch_id", branchId)
    .eq("program_group_id", programGroupId)
    .order("month_start", { ascending: false });

  if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });

  const source = (scheduleRows ?? [])[0] as ScheduleRow | undefined;
  if (!source) {
    return NextResponse.json(
      { error: "No schedules found for this branch/program group" },
      { status: 404 },
    );
  }

  const targetMonthStart = addMonthsIso(source.month_start, 1);

  // 2) Ensure target schedule doesn't exist
  const { data: existingTarget, error: existingTargetError } = await supabase
    .from("schedules")
    .select("id, name, month_start, status, is_approved, branch_id, program_group_id")
    .eq("branch_id", branchId)
    .eq("program_group_id", programGroupId)
    .eq("month_start", targetMonthStart)
    .maybeSingle<ScheduleRow>();

  if (existingTargetError) return NextResponse.json({ error: existingTargetError.message }, { status: 500 });
  if (existingTarget) {
    return NextResponse.json(
      { error: "Target schedule already exists", existing_target_schedule: existingTarget },
      { status: 409 },
    );
  }

  // 3) Headcount policy:
  // - In production (or emulate-prod), cloning is blocked if any source sessions are missing headcount.
  // - In dev/test, cloning is allowed (headcounts are still NOT copied; target headcount is always null).
  const { data: headcountRows, error: headcountError } = await supabase
    .from("class_sessions")
    .select(
      `
        id,
        session_date,
        day_of_week,
        start_time,
        end_time,
        headcount,
        class:class_id(name),
        location:locations!class_sessions_branch_location_fkey(code)
      `,
    )
    .eq("branch_id", branchId)
    .eq("schedule_id", source.id)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<MissingHeadcountSessionRow[]>();

  if (headcountError) return NextResponse.json({ error: headcountError.message }, { status: 500 });

  const totalSessions = (headcountRows ?? []).length;
  const missingSessions: MissingHeadcountSession[] = (headcountRows ?? [])
    .filter((r) => r.headcount === null)
    .map((r) => ({
      id: r.id,
      session_date: r.session_date,
      day_of_week: r.day_of_week,
      start_time: String(r.start_time).slice(0, 5),
      end_time: String(r.end_time).slice(0, 5),
      class_name: normalizeRel(r.class)?.name ?? null,
      location_code: normalizeRel(r.location)?.code ?? null,
    }));

  const missingHeadcountCount = missingSessions.length;
  if (prodGateActive && missingHeadcountCount > 0) {
    return NextResponse.json(
      {
        error: "Missing headcounts in current schedule",
        total_sessions: totalSessions,
        missing_headcount_count: missingHeadcountCount,
        missing_sessions: missingSessions,
        prod_gate_active: true,
      },
      { status: 409 },
    );
  }

  const doClone = async (onProgress?: (p: { done: number; total: number; percent: number }) => void) => {
    // 4) Clear prior clone exception events for this branch.
    // The Exception Report should only reflect the newest clone attempt.
    // Best-effort: ignore missing-table environments.
    {
      const { error: clearErr } = await supabase
        .from("schedule_clone_constraint_events")
        .delete()
        .eq("branch_id", branchId);

      if (clearErr) {
        const msg = String(clearErr.message || "");
        const missingTable =
          (msg.includes("schedule_clone_constraint_events") && msg.includes("does not exist")) || msg.includes("42P01");
        if (!missingTable) throw new Error(clearErr.message);
      }
    }

    // 5) Load source sessions + instructor links
    const { data: sourceSessions, error: sourceSessionsError } = await supabase
      .from("class_sessions")
      .select("id, class_id, location_id, day_of_week, start_time, end_time, session_date, headcount")
      .eq("branch_id", branchId)
      .eq("schedule_id", source.id)
      .order("session_date", { ascending: true })
      .order("start_time", { ascending: true })
      .returns<SourceSessionRow[]>();

    if (sourceSessionsError) throw new Error(sourceSessionsError.message);

    const src = sourceSessions ?? [];
    const srcIds = src.map((s) => s.id).filter(Boolean);

    const instructorMap: Record<string, string[]> = {};
    if (srcIds.length > 0) {
      // Avoid PostgREST "URI too long" by chunking large IN lists.
      for (const chunk of chunkArray(srcIds, 150)) {
        const { data: links, error: linksError } = await supabase
          .from("session_instructors")
          .select("session_id, instructor_id")
          .in("session_id", chunk);

        if (linksError) throw new Error(linksError.message);

        for (const row of (links ?? []) as Array<{ session_id: string; instructor_id: string }>) {
          if (!row.session_id || !row.instructor_id) continue;
          if (!instructorMap[row.session_id]) instructorMap[row.session_id] = [];
          instructorMap[row.session_id].push(row.instructor_id);
        }
      }
    }

    // 6) Pre-clone prep (do not bind to the schedule so Backout does not remove it):
    // - copy instructor availability from source month -> target month (insert missing only)
    // - if target month is January, ensure the new year's US federal holiday rows exist (dev-only auto import)
    const allInstructorIds = Array.from(new Set(Object.values(instructorMap).flatMap((ids) => ids))).filter(Boolean);
    const sourceScheduleMonth = monthPrefixFromMonthStart(source.month_start);
    const targetScheduleMonth = monthPrefixFromMonthStart(targetMonthStart);

    await copyInstructorAvailabilityForTargetMonth({
      supabase,
      branchId,
      instructorIds: allInstructorIds,
      sourceScheduleMonth,
      targetScheduleMonth,
    });

    await ensureUsFederalHolidaysForNewYearIfJanuary({ supabase, branchId, targetMonthStart });

    // 7) Create target schedule (new schedule starts pending approval)
    const targetName = monthNameYearFromMonthStart(targetMonthStart);
    const { data: targetSchedule, error: createScheduleError } = await supabase
      .from("schedules")
      .insert({
        branch_id: branchId,
        program_group_id: programGroupId,
        name: targetName,
        month_start: targetMonthStart,
        status: "draft",
        is_approved: false,
        cloned_from_id: source.id,
      })
      .select("id, name, month_start, status, is_approved, branch_id, program_group_id")
      .single();

    if (createScheduleError) throw new Error(createScheduleError.message);
    const target = targetSchedule as ScheduleRow;

    // 8) Load constraint data for the target month (availability + holidays)
    const instructorAvailability = await loadTargetMonthInstructorAvailability({
      supabase,
      branchId,
      instructorIds: allInstructorIds,
      scheduleMonth: targetScheduleMonth,
    });
    const holidays = await loadTargetMonthHolidays({
      supabase,
      branchId,
      scheduleMonth: targetScheduleMonth,
    });
    const conflictConfig = {
      ...getDefaultConflictEngineConfig(),
      scheduleMonth: targetScheduleMonth,
      instructorAvailability,
      holidays,
    };

    // 9) Build clone plan (map dates)
    const sourceMonthStart = source.month_start;
    const targetMonthPrefix = monthPrefixFromMonthStart(targetMonthStart);

    const exceptionEvents: CloneConstraintEventInsert[] = [];

    const plan: Array<{
      source_session_id: string;
      target_session_date: string | null;
      target_day_of_week: string;
      class_id: string;
      location_id: string;
      start_time: string;
      end_time: string;
      instructor_ids: string[];
    }> = [];

    for (const s of src) {
      const mapping = mapSessionDateToNextMonthByWeekdayOrdinal({
        sourceSessionDate: s.session_date,
        sourceMonthStartIsoDate: sourceMonthStart,
        targetMonthStartIsoDate: targetMonthStart,
      });

      const targetDate = mapping.targetSessionDate;
      const targetDow = targetDate ? weekdayFromIsoDateUtc(targetDate) : mapping.weekday;
      const startTime = String(s.start_time).slice(0, 5);
      const endTime = String(s.end_time).slice(0, 5);

      if (!targetDate) {
        exceptionEvents.push({
          branch_id: branchId,
          program_group_id: programGroupId,
          source_schedule_id: source.id,
          target_schedule_id: target.id,
          event_type: "SKIPPED_MISSING_OCCURRENCE",
          source_session_id: s.id,
          class_id: s.class_id ?? null,
          location_id: s.location_id ?? null,
          target_session_date: null,
          target_day_of_week: targetDow ?? null,
          target_start_time: startTime,
          target_end_time: endTime,
          details: {
            reason: "Missing weekday occurrence in target month",
            source_session_date: s.session_date,
            source_month_start: sourceMonthStart,
            target_month_start: targetMonthStart,
          },
        });
      }

      plan.push({
        source_session_id: s.id,
        target_session_date: targetDate,
        target_day_of_week: targetDow,
        class_id: s.class_id,
        location_id: s.location_id,
        start_time: startTime,
        end_time: endTime,
        instructor_ids: instructorMap[s.id] ?? [],
      });
    }

    const skippable = plan.filter((p) => p.target_session_date === null);
    const candidates = plan.filter((p) => p.target_session_date !== null) as Array<
      Omit<(typeof plan)[number], "target_session_date"> & { target_session_date: string }
    >;

    // Deduplicate within the clone plan to avoid unique constraint failures (best-effort).
    const seen = new Set<string>();
    const deduped: typeof candidates = [];
    let dedupedSkipped = 0;
    for (const p of candidates) {
      const key = [
        p.target_session_date,
        p.target_day_of_week,
        p.start_time,
        p.end_time,
        p.class_id,
        p.location_id,
      ].join("|");
      if (seen.has(key)) {
        dedupedSkipped += 1;
        exceptionEvents.push({
          branch_id: branchId,
          program_group_id: programGroupId,
          source_schedule_id: source.id,
          target_schedule_id: target.id,
          event_type: "SKIPPED_DEDUPED",
          source_session_id: p.source_session_id ?? null,
          class_id: p.class_id ?? null,
          location_id: p.location_id ?? null,
          target_session_date: p.target_session_date ?? null,
          target_day_of_week: p.target_day_of_week ?? null,
          target_start_time: p.start_time ?? null,
          target_end_time: p.end_time ?? null,
          details: {
            reason: "Deduped (duplicate target session key)",
            dedupe_key: key,
          },
        });
        continue;
      }
      seen.add(key);
      deduped.push(p);
    }

    // 10) Insert sessions + instructor links (sequential to preserve mapping reliably)
    const createdSessionIds: string[] = [];
    const engineSessions: SessionForConflicts[] = [];
    let skippedOutsideTargetMonth = 0;
    let skippedConstraintConflicts = 0;
    try {
      const totalToInsert = deduped.length;
      let processed = 0;
      for (const p of deduped) {
        processed += 1;
        // safety: ensure target date is inside target month
        if (!p.target_session_date.startsWith(targetMonthPrefix)) {
          skippedOutsideTargetMonth += 1;
          exceptionEvents.push({
            branch_id: branchId,
            program_group_id: programGroupId,
            source_schedule_id: source.id,
            target_schedule_id: target.id,
            event_type: "SKIPPED_OUTSIDE_TARGET_MONTH",
            source_session_id: p.source_session_id ?? null,
            class_id: p.class_id ?? null,
            location_id: p.location_id ?? null,
            target_session_date: p.target_session_date ?? null,
            target_day_of_week: p.target_day_of_week ?? null,
            target_start_time: p.start_time ?? null,
            target_end_time: p.end_time ?? null,
            details: {
              reason: "Mapped date falls outside target month",
              target_month_prefix: targetMonthPrefix,
            },
          });
          continue;
        }

        const candidateId = `candidate:${p.source_session_id ?? `${processed}`}`;
        const candidate: SessionForConflicts = {
          id: candidateId,
          day_of_week: p.target_day_of_week,
          session_date: p.target_session_date,
          start_time: p.start_time,
          end_time: p.end_time,
          location_id: p.location_id,
          instructor_ids: Array.from(new Set((p.instructor_ids ?? []).filter(Boolean))),
        };

        const conflicts = detectScheduleConflicts([...engineSessions, candidate], conflictConfig);
        const candidateConflicts = conflicts.filter((c) => {
          if (c.session_a_id === candidateId || c.session_b_id === candidateId) return true;
          if (c.type === "INSTRUCTOR_MAX_HOURS") {
            const instructorId = typeof c.meta?.instructor_id === "string" ? c.meta.instructor_id : null;
            return !!instructorId && candidate.instructor_ids.includes(instructorId);
          }
          return false;
        });
        const blockingConflicts = candidateConflicts.filter(
          (c) => c.severity === "HIGH" || c.severity === "MEDIUM",
        );

        if (blockingConflicts.length > 0) {
          skippedConstraintConflicts += 1;
          exceptionEvents.push({
            branch_id: branchId,
            program_group_id: programGroupId,
            source_schedule_id: source.id,
            target_schedule_id: target.id,
            event_type: "SKIPPED_CONSTRAINT_CONFLICT",
            source_session_id: p.source_session_id ?? null,
            class_id: p.class_id ?? null,
            location_id: p.location_id ?? null,
            target_session_date: p.target_session_date ?? null,
            target_day_of_week: p.target_day_of_week ?? null,
            target_start_time: p.start_time ?? null,
            target_end_time: p.end_time ?? null,
            details: {
              reason: buildConstraintReason(blockingConflicts),
              conflicts: blockingConflicts.map((c) => ({
                type: c.type,
                severity: c.severity,
                message: c.message,
                meta: c.meta ?? null,
              })),
            },
          });
          if (onProgress) {
            const total = Math.max(1, totalToInsert);
            const percent = Math.round((processed / total) * 100);
            onProgress({ done: processed, total, percent });
          }
          continue;
        }

        const { data: created, error: insertErr } = await supabase
          .from("class_sessions")
          .insert({
            branch_id: branchId,
            schedule_id: target.id,
            class_id: p.class_id,
            location_id: p.location_id,
            day_of_week: p.target_day_of_week,
            start_time: p.start_time,
            end_time: p.end_time,
            session_date: p.target_session_date,
            effective_month: `${targetMonthPrefix}-01`,
            headcount: null,
          })
          .select("id")
          .single();

        if (insertErr) throw new Error(insertErr.message);
        const createdId = String((created as any)?.id ?? "");
        createdSessionIds.push(createdId);

        if (onProgress) {
          const total = Math.max(1, totalToInsert);
          const percent = Math.round((processed / total) * 100);
          onProgress({ done: processed, total, percent });
        }

        if (candidate.instructor_ids.length > 0) {
          const links = candidate.instructor_ids.map((instructor_id) => ({
            session_id: created.id,
            instructor_id,
          }));
          const { error: linkErr } = await supabase.from("session_instructors").insert(links);
          if (linkErr) throw new Error(linkErr.message);
        }

        engineSessions.push({
          id: createdId,
          day_of_week: p.target_day_of_week,
          session_date: p.target_session_date,
          start_time: p.start_time,
          end_time: p.end_time,
          location_id: p.location_id,
          instructor_ids: candidate.instructor_ids,
        });
      }
    } catch (e) {
      // Cleanup schedule (cascade deletes sessions)
      await supabase.from("schedules").delete().eq("id", target.id);
      throw e;
    }

    const modifiedSessionsTotal = 0;
    const skippedTotal =
      skippable.length + dedupedSkipped + skippedOutsideTargetMonth + skippedConstraintConflicts;

    // 11) Audit log
    const { data: auditRow, error: auditErr } = await supabase
      .from("schedule_clone_audit")
      .insert({
        branch_id: branchId,
        program_group_id: programGroupId,
        source_schedule_id: source.id,
        target_schedule_id: target.id,
        source_month_start: sourceMonthStart,
        target_month_start: targetMonthStart,
        missing_headcount_count: missingHeadcountCount,
        override_missing_headcounts: override,
        sessions_source_count: src.length,
        sessions_created_count: createdSessionIds.length,
        sessions_skipped_count: skippedTotal,
        deduped_skipped_count: dedupedSkipped,
        requested_by_email: access?.email ?? null,
        requested_by_recipient_type: access?.recipient_type ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (auditErr) throw new Error(auditErr.message);

    const auditId = String(auditRow?.id ?? "");
    if (auditId && exceptionEvents.length > 0) {
      const isMissingTable = (msg: string): boolean => {
        const m = String(msg || "");
        return (m.includes("schedule_clone_constraint_events") && m.includes("does not exist")) || m.includes("42P01");
      };

      for (const chunk of chunkArray(exceptionEvents, 500)) {
        const payload = chunk.map((e) => ({ audit_id: auditId, ...e }));
        const { error: eventsErr } = await supabase.from("schedule_clone_constraint_events").insert(payload);
        // Backward-compatible dev fallback if the migration wasn't applied yet.
        if (eventsErr && isMissingTable(eventsErr.message)) break;
        if (eventsErr) throw new Error(eventsErr.message);
      }
    }

    return {
      branch_id: branchId,
      program_group_id: programGroupId,
      source_schedule: source,
      target_schedule: target,
      summary: {
        total_source_sessions: src.length,
        created_sessions: createdSessionIds.length,
        skipped_missing_occurrence: skippable.length,
        deduped_skipped: dedupedSkipped,
        skipped_outside_target_month: skippedOutsideTargetMonth,
        skipped_constraint_conflicts: skippedConstraintConflicts,
        skipped_no_instructors_after_availability: 0,
        skipped_sessions_total: skippedTotal,
        modified_sessions_total: modifiedSessionsTotal,
        missing_headcount_count: missingHeadcountCount,
        override_missing_headcounts: override,
        prod_gate_active: prodGateActive,
      },
    };
  };

  if (!stream) {
    try {
      const result = await doClone();
      return NextResponse.json(result);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to clone schedule" },
        { status },
      );
    }
  }

  const encoder = new TextEncoder();
  const sseStream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("start", {
          branch_id: branchId,
          program_group_id: programGroupId,
          source_schedule_id: source.id,
          target_month_start: targetMonthStart,
        });

        let lastPercent = 0;
        const result = await doClone((p) => {
          if (p.percent === lastPercent) return;
          lastPercent = p.percent;
          send("progress", p);
        });

        send("complete", result);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        send("error", { error: e instanceof Error ? e.message : "Failed to clone schedule", status });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

