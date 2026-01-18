import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { addMonthsIso } from "@/lib/scheduling/clone-utils";

type PreflightPayload = {
  branch_id?: string;
  program_group_id: string;
};

type ScheduleRow = {
  id: string;
  name: string;
  month_start: string; // "YYYY-MM-DD"
  status: string;
  branch_id: string;
  program_group_id: string;
};

type MissingSessionRow = {
  id: string;
  class_id?: string | null;
  session_date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  headcount: number | null;
  class?: { name: string } | { name: string }[] | null;
  location?: { code: string } | { code: string }[] | null;
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

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: PreflightPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const programGroupId = (body.program_group_id ?? "").trim();
  if (!programGroupId) return NextResponse.json({ error: "program_group_id is required" }, { status: 400 });

  const access = required.access;
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();

  // Most recent schedule = greatest month_start for branch+group (regardless of status).
  const { data: scheduleRows, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, name, month_start, status, branch_id, program_group_id")
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

  // Check if target schedule already exists.
  const { data: existingTarget, error: targetError } = await supabase
    .from("schedules")
    .select("id, name, month_start, status, branch_id, program_group_id")
    .eq("branch_id", branchId)
    .eq("program_group_id", programGroupId)
    .eq("month_start", targetMonthStart)
    .maybeSingle<ScheduleRow>();

  if (targetError) return NextResponse.json({ error: targetError.message }, { status: 500 });

  // Headcount completeness check on source schedule (required unless override).
  const { data: sessionRows, error: sessionsError } = await supabase
    .from("class_sessions")
    .select(
      `
        id,
        class_id,
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
    .returns<MissingSessionRow[]>();

  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 });

  const allSessions = sessionRows ?? [];
  const missing = allSessions
    .filter((s) => s.headcount === null)
    .map((s) => ({
      id: s.id,
      session_date: s.session_date,
      day_of_week: s.day_of_week,
      start_time: String(s.start_time).slice(0, 5),
      end_time: String(s.end_time).slice(0, 5),
      class_name: normalizeRel(s.class)?.name ?? null,
      location_code: normalizeRel(s.location)?.code ?? null,
    }));

  const uniqueClassKey = (s: MissingSessionRow): string | null => {
    if (typeof s.class_id === "string" && s.class_id.trim()) return s.class_id;
    const name = normalizeRel(s.class)?.name ?? null;
    return typeof name === "string" && name.trim() ? name : null;
  };

  const uniqueClasses = new Set(allSessions.map(uniqueClassKey).filter(Boolean)).size;

  let uniqueInstructors = 0;
  const sessionIds = allSessions.map((s) => s.id).filter(Boolean);
  if (sessionIds.length > 0) {
    // Avoid PostgREST "URI too long" by chunking large IN lists.
    const instructorIds = new Set<string>();
    for (const chunk of chunkArray(sessionIds, 150)) {
      const { data: links, error: linksError } = await supabase
        .from("session_instructors")
        .select("instructor_id")
        .in("session_id", chunk);

      if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 });

      for (const row of (links ?? []) as Array<{ instructor_id: string | null }>) {
        if (row.instructor_id) instructorIds.add(row.instructor_id);
      }
    }
    uniqueInstructors = instructorIds.size;
  }

  return NextResponse.json({
    branch_id: branchId,
    program_group_id: programGroupId,
    source_schedule: source,
    target_month_start: targetMonthStart,
    target_exists: !!existingTarget,
    existing_target_schedule: existingTarget ?? null,
    stats: {
      total_sessions: allSessions.length,
      unique_classes: uniqueClasses,
      unique_instructors: uniqueInstructors,
    },
    headcount: {
      total_sessions: allSessions.length,
      missing_count: missing.length,
      missing_sessions: missing,
    },
    // UX flags
    can_clone_without_override: missing.length === 0 && !existingTarget,
  });
}

