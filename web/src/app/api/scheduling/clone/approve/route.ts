import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type ApprovePayload = {
  branch_id?: string;
  schedule_id: string;
};

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: ApprovePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const scheduleId = (body.schedule_id ?? "").trim();
  if (!scheduleId) return NextResponse.json({ error: "schedule_id is required" }, { status: 400 });

  const access = required.access;
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  // Branch users cannot approve for other branches
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from("schedules")
    .select("id, branch_id, is_approved")
    .eq("id", scheduleId)
    .eq("branch_id", branchId)
    .maybeSingle<{ id: string; branch_id: string; is_approved: boolean }>();

  if (scheduleError) return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  if (!scheduleRow) return NextResponse.json({ error: "Schedule not found for this branch" }, { status: 404 });

  if (scheduleRow.is_approved === true) {
    return NextResponse.json({ ok: true, already_approved: true, schedule_id: scheduleId, branch_id: branchId });
  }

  const { error: updateError } = await supabase
    .from("schedules")
    .update({ is_approved: true })
    .eq("id", scheduleId)
    .eq("branch_id", branchId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, schedule_id: scheduleId, branch_id: branchId, approved: true });
}

