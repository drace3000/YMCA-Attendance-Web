import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type ConstraintEventType =
  | "SKIPPED_MISSING_OCCURRENCE"
  | "SKIPPED_OUTSIDE_TARGET_MONTH"
  | "SKIPPED_DEDUPED"
  | "SKIPPED_NO_INSTRUCTORS_AFTER_AVAILABILITY"
  | "MODIFIED_DROPPED_INSTRUCTORS";

type ConstraintEventRow = {
  id: string;
  audit_id: string;
  branch_id: string;
  program_group_id: string;
  source_schedule_id: string | null;
  target_schedule_id: string;
  event_type: ConstraintEventType;
  source_session_id: string | null;
  class_id: string | null;
  location_id: string | null;
  target_session_date: string | null;
  target_day_of_week: string | null;
  target_start_time: string | null;
  target_end_time: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

type CloneAuditRow = {
  id: string;
  branch_id: string;
  program_group_id: string;
  source_schedule_id: string;
  target_schedule_id: string;
  source_month_start: string;
  target_month_start: string;
  sessions_created_count: number;
  sessions_skipped_count: number;
};

function monthNameYearFromMonthStart(monthStartIsoDate: string): string {
  const d = new Date(`${monthStartIsoDate}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function suggestedResolutionForType(type: ConstraintEventType): string {
  switch (type) {
    case "SKIPPED_MISSING_OCCURRENCE":
      return "Review the target month calendar for that weekday occurrence (e.g., 5th Monday). If the session is still needed, manually add a session in the cloned schedule for the closest appropriate date/time.";
    case "SKIPPED_OUTSIDE_TARGET_MONTH":
      return "This session mapped outside the target month and was skipped for safety. If it should exist in the cloned month, manually add it to the target schedule.";
    case "SKIPPED_DEDUPED":
      return "A duplicate target session was detected (same date/time/class/location). Review the cloned schedule to ensure the intended session exists and adjust or add sessions manually if required.";
    case "SKIPPED_NO_INSTRUCTORS_AFTER_AVAILABILITY":
      return "All assigned instructors were unavailable for the target date/time. Update instructor availability for the target month or reassign an available instructor, then add the session manually if needed.";
    case "MODIFIED_DROPPED_INSTRUCTORS":
      return "Some instructor assignments were removed due to constraints (e.g., availability). Review the session and reassign instructors as needed.";
  }
}

function labelForType(type: ConstraintEventType): string {
  switch (type) {
    case "SKIPPED_MISSING_OCCURRENCE":
      return "Skipped: Missing weekday occurrence";
    case "SKIPPED_OUTSIDE_TARGET_MONTH":
      return "Skipped: Outside target month";
    case "SKIPPED_DEDUPED":
      return "Skipped: Deduped (duplicate)";
    case "SKIPPED_NO_INSTRUCTORS_AFTER_AVAILABILITY":
      return "Skipped: No instructors available";
    case "MODIFIED_DROPPED_INSTRUCTORS":
      return "Modified: Instructors dropped";
  }
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  const size = Math.max(1, Math.floor(chunkSize));
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function extractStringArray(details: Record<string, unknown>, key: string): string[] {
  const raw = (details as any)?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v ?? "").trim()).filter(Boolean);
}

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const requestedBranchId = (searchParams.get("branch_id") ?? "").trim() || null;
  const programGroupId = (searchParams.get("program_group_id") ?? "").trim();
  const targetScheduleId = (searchParams.get("target_schedule_id") ?? "").trim();

  if (!programGroupId) return NextResponse.json({ error: "program_group_id is required" }, { status: 400 });
  if (!targetScheduleId) return NextResponse.json({ error: "target_schedule_id is required" }, { status: 400 });

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  // Branch users cannot query other branches.
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  // 1) Load audit row for this clone target
  const { data: audit, error: auditError } = await supabase
    .from("schedule_clone_audit")
    .select(
      "id, branch_id, program_group_id, source_schedule_id, target_schedule_id, source_month_start, target_month_start, sessions_created_count, sessions_skipped_count",
    )
    .eq("branch_id", branchId)
    .eq("program_group_id", programGroupId)
    .eq("target_schedule_id", targetScheduleId)
    .order("created_at", { ascending: false })
    .maybeSingle<CloneAuditRow>();

  if (auditError) return NextResponse.json({ error: auditError.message }, { status: 500 });
  if (!audit) return NextResponse.json({ error: "Clone audit not found for this target schedule" }, { status: 404 });

  // 2) Branch + association names for the org line
  const { data: branchRow, error: branchError } = await supabase
    .from("ymca_branches")
    .select(
      `
        id,
        name,
        association:association_id (
          name
        )
      `,
    )
    .eq("id", branchId)
    .single<{
      id: string;
      name: string;
      association?: { name: string } | { name: string }[] | null;
    }>();

  if (branchError) return NextResponse.json({ error: branchError.message }, { status: 500 });

  const associationName =
    Array.isArray(branchRow.association) ? branchRow.association[0]?.name ?? null : branchRow.association?.name ?? null;
  const branchName = branchRow.name ?? "Unknown";
  const orgLine = `${associationName ?? "Unknown"} - ${branchName}`;

  // 3) Load constraint events
  const { data: events, error: eventsError } = await supabase
    .from("schedule_clone_constraint_events")
    .select(
      "id, audit_id, branch_id, program_group_id, source_schedule_id, target_schedule_id, event_type, source_session_id, class_id, location_id, target_session_date, target_day_of_week, target_start_time, target_end_time, details, created_at",
    )
    .eq("audit_id", audit.id)
    .order("created_at", { ascending: true })
    .returns<ConstraintEventRow[]>();

  // Backward-compatible: if table isn't present yet, return empty groups.
  if (eventsError) {
    const msg = String(eventsError.message || "");
    const missingTable =
      (msg.includes("schedule_clone_constraint_events") && msg.includes("does not exist")) || msg.includes("42P01");
    if (!missingTable) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const rows = events ?? [];

  // 4) Enrich with class name + location code/name for readability (best-effort)
  const classIds = Array.from(new Set(rows.map((r) => r.class_id).filter(Boolean))) as string[];
  const locationIds = Array.from(new Set(rows.map((r) => r.location_id).filter(Boolean))) as string[];

  const classNameById: Record<string, string> = {};
  for (const chunk of chunkArray(classIds, 200)) {
    const { data, error } = await supabase.from("classes").select("id, name").eq("branch_id", branchId).in("id", chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const c of (data ?? []) as Array<{ id: string; name: string }>) classNameById[c.id] = c.name;
  }

  const locationById: Record<string, { code: string; name: string }> = {};
  for (const chunk of chunkArray(locationIds, 200)) {
    const { data, error } = await supabase
      .from("locations")
      .select("id, code, name")
      .eq("branch_id", branchId)
      .in("id", chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const l of (data ?? []) as Array<{ id: string; code: string; name: string }>) {
      locationById[l.id] = { code: l.code, name: l.name };
    }
  }

  // 5) Enrich instructors referenced in details (e.g., dropped/kept instructor IDs).
  const instructorIdsFromDetails = new Set<string>();
  for (const r of rows) {
    const d = (r.details ?? {}) as Record<string, unknown>;
    for (const id of extractStringArray(d, "dropped_instructor_ids")) instructorIdsFromDetails.add(id);
    for (const id of extractStringArray(d, "kept_instructor_ids")) instructorIdsFromDetails.add(id);
    for (const id of extractStringArray(d, "original_instructor_ids")) instructorIdsFromDetails.add(id);
  }

  const instructorById: Record<
    string,
    { id: string; nickname: string | null; readable_id: string | null; label: string }
  > = {};

  const instructorIds = Array.from(instructorIdsFromDetails);
  for (const chunk of chunkArray(instructorIds, 200)) {
    const { data, error } = await supabase
      .from("instructors")
      .select("id, nickname, readable_id, first_name, last_name")
      .in("id", chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const r of (data ?? []) as Array<{
      id: string;
      nickname: string | null;
      readable_id: string | null;
      first_name: string | null;
      last_name: string | null;
    }>) {
      const nickname = r.nickname ? String(r.nickname).trim() : "";
      const first = r.first_name ? String(r.first_name).trim() : "";
      const last = r.last_name ? String(r.last_name).trim() : "";
      const readable = r.readable_id ? String(r.readable_id).trim() : "";
      const nameFallback = [first, last].filter(Boolean).join(" ").trim();
      const base = nickname || nameFallback || null;
      const label = [base, readable].filter(Boolean).join(" • ") || r.id;
      instructorById[r.id] = { id: r.id, nickname: base, readable_id: readable || null, label };
    }
  }

  const modifiedTotal = rows.filter((r) => r.event_type.startsWith("MODIFIED_")).length;
  const skippedTotal = rows.filter((r) => r.event_type.startsWith("SKIPPED_")).length;

  const title = `Cloning ${monthNameYearFromMonthStart(audit.target_month_start)} Schedule Exception Report`;

  const byType = new Map<ConstraintEventType, ConstraintEventRow[]>();
  for (const r of rows) {
    const list = byType.get(r.event_type) ?? [];
    list.push(r);
    byType.set(r.event_type, list);
  }

  const typesInOrder: ConstraintEventType[] = [
    "SKIPPED_MISSING_OCCURRENCE",
    "SKIPPED_OUTSIDE_TARGET_MONTH",
    "SKIPPED_DEDUPED",
    "SKIPPED_NO_INSTRUCTORS_AFTER_AVAILABILITY",
    "MODIFIED_DROPPED_INSTRUCTORS",
  ];

  const groups = typesInOrder
    .filter((t) => (byType.get(t) ?? []).length > 0)
    .map((t) => {
      const groupRows = byType.get(t) ?? [];
      return {
        event_type: t,
        label: labelForType(t),
        count: groupRows.length,
        suggested_resolution: suggestedResolutionForType(t),
        rows: groupRows.map((r) => ({
          id: r.id,
          source_session_id: r.source_session_id,
          target_session_date: r.target_session_date,
          target_day_of_week: r.target_day_of_week,
          target_start_time: r.target_start_time ? String(r.target_start_time).slice(0, 5) : null,
          target_end_time: r.target_end_time ? String(r.target_end_time).slice(0, 5) : null,
          class: r.class_id ? { id: r.class_id, name: classNameById[r.class_id] ?? null } : null,
          location: r.location_id
            ? {
                id: r.location_id,
                code: locationById[r.location_id]?.code ?? null,
                name: locationById[r.location_id]?.name ?? null,
              }
            : null,
          details: (() => {
            const base = (r.details ?? {}) as Record<string, unknown>;
            const droppedIds = extractStringArray(base, "dropped_instructor_ids");
            const keptIds = extractStringArray(base, "kept_instructor_ids");
            const originalIds = extractStringArray(base, "original_instructor_ids");

            const enrich = (ids: string[]) =>
              ids
                .map((id) => instructorById[id] ?? null)
                .filter(Boolean)
                .map((x) => ({ id: x!.id, nickname: x!.nickname, readable_id: x!.readable_id, label: x!.label }));

            return {
              ...base,
              dropped_instructors: droppedIds.length > 0 ? enrich(droppedIds) : undefined,
              kept_instructors: keptIds.length > 0 ? enrich(keptIds) : undefined,
              original_instructors: originalIds.length > 0 ? enrich(originalIds) : undefined,
            };
          })(),
        })),
      };
    });

  return NextResponse.json({
    ok: true,
    title,
    org_line: orgLine,
    stats: {
      created_sessions: audit.sessions_created_count ?? 0,
      skipped_sessions: audit.sessions_skipped_count ?? skippedTotal,
      modified_sessions: modifiedTotal,
    },
    context: {
      branch_id: branchId,
      program_group_id: programGroupId,
      source_schedule_id: audit.source_schedule_id,
      target_schedule_id: audit.target_schedule_id,
      source_month_start: audit.source_month_start,
      target_month_start: audit.target_month_start,
    },
    groups,
  });
}

