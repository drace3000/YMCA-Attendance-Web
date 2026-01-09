import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

// GET - List all schedules
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branch_id");
  const programGroupId = searchParams.get("program_group_id");
  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("schedules")
    .select("id, name, month_start, status, published_at, created_at, branch_id, program_group_id")
    .order("month_start", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);
  if (programGroupId) query = query.eq("program_group_id", programGroupId);

  const { data: schedules, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedules: schedules || [] });
}
