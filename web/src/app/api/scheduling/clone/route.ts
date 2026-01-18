import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import {
  addMonthsIso,
  mapSessionDateToNextMonthByWeekdayOrdinal,
  monthPrefixFromMonthStart,
  weekdayFromIsoDateUtc,
} from "@/lib/scheduling/clone-utils";

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

function monthNameYearFromMonthStart(monthStartIsoDate: string): string {
  const d = new Date(`${monthStartIsoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
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

  const access = required.access;
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();

  // 1) Load most recent schedule (source)
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

  // 2) Ensure target schedule doesn't exist
  const { data: existingTarget, error: existingTargetError } = await supabase
    .from("schedules")
    .select("id, name, month_start, status, branch_id, program_group_id")
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

  // 3) Headcount completeness gate (unless override)
  const { data: headcountRows, error: headcountError } = await supabase
    .from("class_sessions")
    .select("id, headcount")
    .eq("branch_id", branchId)
    .eq("schedule_id", source.id);

  if (headcountError) return NextResponse.json({ error: headcountError.message }, { status: 500 });

  const totalSessions = (headcountRows ?? []).length;
  const missingHeadcountCount = (headcountRows ?? []).filter((r: any) => r.headcount === null).length;
  if (missingHeadcountCount > 0 && !override) {
    return NextResponse.json(
      { error: "Missing headcounts in current schedule", missing_headcount_count: missingHeadcountCount, total_sessions: totalSessions },
      { status: 409 },
    );
  }

  // 4) Create target schedule
  const targetName = monthNameYearFromMonthStart(targetMonthStart);
  const { data: targetSchedule, error: createScheduleError } = await supabase
    .from("schedules")
    .insert({
      branch_id: branchId,
      program_group_id: programGroupId,
      name: targetName,
      month_start: targetMonthStart,
      status: "draft",
      cloned_from_id: source.id,
    })
    .select("id, name, month_start, status, branch_id, program_group_id")
    .single();

  if (createScheduleError) return NextResponse.json({ error: createScheduleError.message }, { status: 500 });

  const target = targetSchedule as ScheduleRow;

  // 5) Load source sessions + instructor links
  const { data: sourceSessions, error: sourceSessionsError } = await supabase
    .from("class_sessions")
    .select("id, class_id, location_id, day_of_week, start_time, end_time, session_date, headcount")
    .eq("branch_id", branchId)
    .eq("schedule_id", source.id)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .returns<SourceSessionRow[]>();

  if (sourceSessionsError) {
    // best-effort cleanup
    await supabase.from("schedules").delete().eq("id", target.id);
    return NextResponse.json({ error: sourceSessionsError.message }, { status: 500 });
  }

  const src = sourceSessions ?? [];
  const srcIds = src.map((s) => s.id).filter(Boolean);

  const instructorMap: Record<string, string[]> = {};
  if (srcIds.length > 0) {
    const { data: links, error: linksError } = await supabase
      .from("session_instructors")
      .select("session_id, instructor_id")
      .in("session_id", srcIds);

    if (linksError) {
      await supabase.from("schedules").delete().eq("id", target.id);
      return NextResponse.json({ error: linksError.message }, { status: 500 });
    }

    for (const row of (links ?? []) as Array<{ session_id: string; instructor_id: string }>) {
      if (!row.session_id || !row.instructor_id) continue;
      if (!instructorMap[row.session_id]) instructorMap[row.session_id] = [];
      instructorMap[row.session_id].push(row.instructor_id);
    }
  }

  // 6) Build clone plan (map dates)
  const sourceMonthStart = source.month_start;
  const targetMonthPrefix = monthPrefixFromMonthStart(targetMonthStart);

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

    plan.push({
      source_session_id: s.id,
      target_session_date: targetDate,
      target_day_of_week: targetDow,
      class_id: s.class_id,
      location_id: s.location_id,
      start_time: String(s.start_time).slice(0, 5),
      end_time: String(s.end_time).slice(0, 5),
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
      continue;
    }
    seen.add(key);
    deduped.push(p);
  }

  // 7) Insert sessions + instructor links (sequential to preserve mapping reliably)
  const createdSessionIds: string[] = [];
  try {
    for (const p of deduped) {
      // safety: ensure target date is inside target month
      if (!p.target_session_date.startsWith(targetMonthPrefix)) continue;

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
      createdSessionIds.push(String((created as any)?.id));

      const instructorIds = p.instructor_ids ?? [];
      if (instructorIds.length > 0) {
        const links = instructorIds.map((instructor_id) => ({
          session_id: created.id,
          instructor_id,
        }));
        const { error: linkErr } = await supabase.from("session_instructors").insert(links);
        if (linkErr) throw new Error(linkErr.message);
      }
    }
  } catch (e) {
    // Cleanup schedule (cascade deletes sessions)
    await supabase.from("schedules").delete().eq("id", target.id);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clone schedule" },
      { status: 500 },
    );
  }

  // 8) Audit log
  await supabase.from("schedule_clone_audit").insert({
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
    sessions_skipped_count: skippable.length,
    deduped_skipped_count: dedupedSkipped,
    requested_by_email: access?.email ?? null,
    requested_by_recipient_type: access?.recipient_type ?? null,
  });

  return NextResponse.json({
    branch_id: branchId,
    program_group_id: programGroupId,
    source_schedule: source,
    target_schedule: target,
    summary: {
      total_source_sessions: src.length,
      created_sessions: createdSessionIds.length,
      skipped_missing_occurrence: skippable.length,
      deduped_skipped: dedupedSkipped,
      missing_headcount_count: missingHeadcountCount,
      override_missing_headcounts: override,
    },
  });
}

