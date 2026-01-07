import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type ProgramGroup = {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  is_enabled: boolean;
};

type BranchProgramGroupRow = {
  branch_id: string;
  program_group_id: string;
  is_enabled: boolean;
};

type UpdateBranchGroupsPayload = {
  enabled_group_ids: string[];
};

// GET - list all active groups with enabled flag for this branch
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const branchId = params.id;
  const supabase = createSupabaseServerClient();

  const { data: groups, error: groupsError } = await supabase
    .from("program_groups")
    .select("id, code, name, description, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<Omit<ProgramGroup, "is_enabled">[]>();

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  const { data: branchRows, error: branchError } = await supabase
    .from("branch_program_groups")
    .select("branch_id, program_group_id, is_enabled")
    .eq("branch_id", branchId)
    .returns<BranchProgramGroupRow[]>();

  if (branchError) {
    return NextResponse.json({ error: branchError.message }, { status: 500 });
  }

  const enabledSet = new Set(
    (branchRows ?? []).filter((r) => r.is_enabled).map((r) => r.program_group_id)
  );

  const result: ProgramGroup[] = (groups ?? []).map((g) => ({
    ...g,
    is_enabled: enabledSet.has(g.id),
  }));

  return NextResponse.json({ groups: result });
}

// PUT - update enabled groups for this branch (upsert true/false for all active groups)
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const branchId = params.id;
  const supabase = createSupabaseServerClient();

  let body: UpdateBranchGroupsPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const enabledIds = new Set(body.enabled_group_ids ?? []);

  const { data: groups, error: groupsError } = await supabase
    .from("program_groups")
    .select("id")
    .eq("is_active", true)
    .returns<{ id: string }[]>();

  if (groupsError) {
    return NextResponse.json({ error: groupsError.message }, { status: 500 });
  }

  const upserts =
    (groups ?? []).map((g) => ({
      branch_id: branchId,
      program_group_id: g.id,
      is_enabled: enabledIds.has(g.id),
    })) ?? [];

  const { error: upsertError } = await supabase
    .from("branch_program_groups")
    .upsert(upserts, { onConflict: "branch_id,program_group_id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}


