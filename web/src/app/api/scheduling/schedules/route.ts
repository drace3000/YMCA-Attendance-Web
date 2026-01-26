import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

// GET - List all schedules
export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const requestedBranchId = searchParams.get("branch_id");
  const programGroupId = searchParams.get("program_group_id");
  const supabase = createSupabaseServerClient();

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access
      ? access.branch_id
      : requestedBranchId ?? access?.branch_id ?? null;

  if (!branchId) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  const isMissingApprovalColumnError = (message: string): boolean => {
    const m = String(message || "");
    return (
      m.includes("is_approved") ||
      m.includes("column") && m.includes("does not exist") ||
      m.includes("42703")
    );
  };

  const buildQuery = (withApproval: boolean) => {
    const columns = withApproval
      ? "id, name, month_start, status, is_approved, published_at, created_at, branch_id, program_group_id"
      : "id, name, month_start, status, published_at, created_at, branch_id, program_group_id";

    let query = supabase
      .from("schedules")
      .select(columns)
      .order("month_start", { ascending: false });

    query = query.eq("branch_id", branchId);
    if (programGroupId) query = query.eq("program_group_id", programGroupId);
    return query;
  };

  let { data: schedules, error } = await buildQuery(true);

  // Backward-compatible fallback: if the DB hasn't applied the approval-lock migration yet,
  // the `is_approved` column won't exist and the select will fail.
  if (error && isMissingApprovalColumnError(error.message)) {
    const retry = await buildQuery(false);
    const res2 = await retry;
    schedules = res2.data;
    error = res2.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedules: schedules || [] });
}

// DELETE - Remove a schedule month/year (admin only)
export async function DELETE(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  if (!required.devPassthrough && required.access?.recipient_type !== "Administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { branch_id?: string; schedule_id?: string } | null;
  const branchId = body?.branch_id ?? null;
  const scheduleId = body?.schedule_id ?? null;

  if (!branchId || !scheduleId) {
    return NextResponse.json({ error: "branch_id and schedule_id are required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, branch_id")
    .eq("id", scheduleId)
    .maybeSingle();

  if (scheduleError) {
    return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  }
  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }
  if (schedule.branch_id && schedule.branch_id !== branchId) {
    return NextResponse.json({ error: "Schedule does not belong to this branch" }, { status: 403 });
  }

  const { error: deleteAuditError } = await supabase
    .from("schedule_clone_audit")
    .delete()
    .or(`source_schedule_id.eq.${scheduleId},target_schedule_id.eq.${scheduleId}`)
    .eq("branch_id", branchId);

  if (deleteAuditError) {
    return NextResponse.json({ error: deleteAuditError.message }, { status: 500 });
  }

  const { count, error: deleteSessionsError } = await supabase
    .from("class_sessions")
    .delete({ count: "exact" })
    .eq("schedule_id", scheduleId)
    .eq("branch_id", branchId);

  if (deleteSessionsError) {
    return NextResponse.json({ error: deleteSessionsError.message }, { status: 500 });
  }

  const { error: deleteScheduleError } = await supabase
    .from("schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("branch_id", branchId);

  if (deleteScheduleError) {
    return NextResponse.json({ error: deleteScheduleError.message }, { status: 500 });
  }

  return NextResponse.json({ removed_sessions: count ?? 0 });
}
