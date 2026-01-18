import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type BackoutPayload = {
  branch_id?: string;
  program_group_id: string;
  schedule_id: string;
};

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: BackoutPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scheduleId = (body.schedule_id ?? "").trim();
  const programGroupId = (body.program_group_id ?? "").trim();
  if (!scheduleId) return NextResponse.json({ error: "schedule_id is required" }, { status: 400 });
  if (!programGroupId) return NextResponse.json({ error: "program_group_id is required" }, { status: 400 });

  const access = required.access;
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  // Branch users cannot backout for other branches
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, branch_id, program_group_id, is_approved, cloned_from_id")
    .eq("id", scheduleId)
    .eq("branch_id", branchId)
    .eq("program_group_id", programGroupId)
    .maybeSingle<{
      id: string;
      branch_id: string;
      program_group_id: string;
      is_approved: boolean;
      cloned_from_id: string | null;
    }>();

  if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  if (!scheduleRow) return NextResponse.json({ error: "Schedule not found for this branch/group" }, { status: 404 });

  if (scheduleRow.is_approved === true) {
    return NextResponse.json(
      { error: "Cannot backout an approved schedule" },
      { status: 409 },
    );
  }

  const { error: deleteError } = await supabase
    .from("schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("branch_id", branchId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // Prefer the original source schedule if it still exists; otherwise fall back to most recent.
  const sourceId = scheduleRow.cloned_from_id;
  if (sourceId) {
    const { data: srcRow, error: srcError } = await supabase
      .from("schedules")
      .select("id")
      .eq("id", sourceId)
      .eq("branch_id", branchId)
      .maybeSingle<{ id: string }>();

    if (!srcError && srcRow?.id) {
      return NextResponse.json({
        ok: true,
        deleted_schedule_id: scheduleId,
        branch_id: branchId,
        program_group_id: programGroupId,
        redirect_schedule_id: srcRow.id,
      });
    }
  }

  const { data: schedules, error: listError } = await supabase
    .from("schedules")
    .select("id, month_start")
    .eq("branch_id", branchId)
    .eq("program_group_id", programGroupId)
    .order("month_start", { ascending: false });

  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const fallbackId = (schedules ?? [])[0]?.id ?? null;
  return NextResponse.json({
    ok: true,
    deleted_schedule_id: scheduleId,
    branch_id: branchId,
    program_group_id: programGroupId,
    redirect_schedule_id: fallbackId,
  });
}

