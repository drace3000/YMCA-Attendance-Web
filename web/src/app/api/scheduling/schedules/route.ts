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

  let query = supabase
    .from("schedules")
    .select("id, name, month_start, status, published_at, created_at, branch_id, program_group_id")
    .order("month_start", { ascending: false });

  query = query.eq("branch_id", branchId);
  if (programGroupId) query = query.eq("program_group_id", programGroupId);

  const { data: schedules, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedules: schedules || [] });
}
