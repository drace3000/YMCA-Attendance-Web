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
