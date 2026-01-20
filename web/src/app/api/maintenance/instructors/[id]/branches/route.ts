import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { autoBackfillIcldForInstructorInBranch } from "@/lib/icld-auto-backfill";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = {
  params: Promise<{ id: string }>;
};

type UpdateInstructorBranchesPayload = {
  branch_ids: string[];
};

export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Branch") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid instructor id format" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("instructor_branches")
    .select("branch_id, is_primary")
    .eq("instructor_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []) as Array<{ branch_id: string; is_primary: boolean }>);
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Branch") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid instructor id format" }, { status: 400 });
  }

  let body: UpdateInstructorBranchesPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const branch_ids = Array.isArray(body.branch_ids) ? body.branch_ids.filter(Boolean) : null;
  if (!branch_ids) {
    return NextResponse.json({ error: "branch_ids must be an array" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { data: instructorRow, error: instructorError } = await supabase
    .from("instructors")
    .select("id, branch_id, nickname, first_name, last_name")
    .eq("id", id)
    .single();

  if (instructorError) {
    return NextResponse.json({ error: instructorError.message }, { status: 500 });
  }
  if (!instructorRow) {
    return NextResponse.json({ error: "Instructor not found" }, { status: 404 });
  }

  const homeBranchId = instructorRow.branch_id as string | null;
  if (!homeBranchId) {
    return NextResponse.json(
      { error: "Instructor home branch is missing; cannot manage sharing." },
      { status: 409 },
    );
  }

  const desired = Array.from(new Set<string>([homeBranchId, ...branch_ids]));

  // Validate that all requested branches exist (friendly error vs FK error).
  const { data: branchRows, error: branchError } = await supabase
    .from("ymca_branches")
    .select("id")
    .in("id", desired)
    .returns<Array<{ id: string }>>();

  if (branchError) return NextResponse.json({ error: branchError.message }, { status: 500 });

  const existing = new Set((branchRows ?? []).map((r) => r.id));
  const missing = desired.filter((bid) => !existing.has(bid));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "One or more branch_ids are invalid", missing_branch_ids: missing },
      { status: 400 },
    );
  }

  const { data: existingLinks, error: existingLinksError } = await supabase
    .from("instructor_branches")
    .select("branch_id")
    .eq("instructor_id", id);

  if (existingLinksError) return NextResponse.json({ error: existingLinksError.message }, { status: 500 });
  const existingBranchIds = new Set<string>((existingLinks ?? []).map((r: { branch_id: string }) => r.branch_id));
  const addedBranchIds = desired.filter((bid) => !existingBranchIds.has(bid));

  // Replace all links for this instructor.
  const { error: deleteError } = await supabase
    .from("instructor_branches")
    .delete()
    .eq("instructor_id", id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const rows = desired.map((branchId) => ({
    instructor_id: id,
    branch_id: branchId,
    is_primary: branchId === homeBranchId,
  }));

  const { error: insertError } = await supabase
    .from("instructor_branches")
    .insert(rows);

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { data: updated, error: updatedError } = await supabase
    .from("instructor_branches")
    .select("branch_id, is_primary")
    .eq("instructor_id", id);

  if (updatedError) return NextResponse.json({ error: updatedError.message }, { status: 500 });

  // Auto-backfill ICLD rows for any newly added branches (idempotent).
  // Important: do not delete ICLD rows when branches are removed.
  if (addedBranchIds.length > 0) {
    const instructor = {
      id: String(instructorRow.id),
      nickname: (instructorRow as any).nickname ?? null,
      first_name: (instructorRow as any).first_name ?? null,
      last_name: (instructorRow as any).last_name ?? null,
    };

    for (const branchId of addedBranchIds) {
      try {
        await autoBackfillIcldForInstructorInBranch({ supabase, branchId, instructor });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Failed to auto-backfill instructor mappings" },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json(updated ?? []);
}


