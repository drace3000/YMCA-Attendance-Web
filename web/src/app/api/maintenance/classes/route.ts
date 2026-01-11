import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type ClassRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  branch_id: string;
  program_group_id: string;
  created_at: string;
};

type CreateClassPayload = {
  name: string;
  description?: string;
  category?: string;
  branch_id: string;
  program_group_id: string;
};

type UpdateClassPayload = {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  is_active?: boolean;
  branch_id?: string;
  program_group_id?: string;
};

// GET - List all classes or check name availability
export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const checkName = searchParams.get("check_name");
  const excludeId = searchParams.get("exclude_id");
  const includeInactive = searchParams.get("include_inactive") === "true";
  const requestedBranchId = searchParams.get("branch_id");
  const programGroupId = searchParams.get("program_group_id");

  const branchId =
    required.access?.recipient_type === "Branch"
      ? required.access.branch_id
      : requestedBranchId;

  const supabase = createSupabaseServerClient();

  // If checking name availability, return validation result
  if (checkName) {
    let query = supabase
      .from("classes")
      .select("id, name")
      .ilike("name", checkName.trim());

    if (branchId) query = query.eq("branch_id", branchId);
    if (programGroupId) query = query.eq("program_group_id", programGroupId);

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const exists = (data?.length ?? 0) > 0;
    return NextResponse.json({ exists });
  }

  // Regular list query
  let query = supabase
    .from("classes")
    .select("id, name, description, category, is_active, branch_id, program_group_id, created_at")
    .order("name", { ascending: true });

  if (branchId) query = query.eq("branch_id", branchId);
  if (programGroupId) query = query.eq("program_group_id", programGroupId);

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST - Create a new class
export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const supabase = createSupabaseServerClient();

  let body: CreateClassPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedBranchId = body.branch_id;
  const branch_id =
    required.access?.recipient_type === "Branch"
      ? required.access.branch_id
      : requestedBranchId;
  const { name, description, category, program_group_id } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!branch_id) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }
  if (!program_group_id) {
    return NextResponse.json({ error: "program_group_id is required" }, { status: 400 });
  }

  // Check name uniqueness
  const { data: existing } = await supabase
    .from("classes")
    .select("id")
    .ilike("name", name.trim())
    .eq("branch_id", branch_id)
    .eq("program_group_id", program_group_id);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "A class with this name already exists" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("classes")
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      category: category?.trim() || null,
      branch_id,
      program_group_id,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT - Update a class
export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const supabase = createSupabaseServerClient();

  let body: UpdateClassPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, name, description, category, is_active, branch_id, program_group_id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Check if class exists
  const { data: current } = await supabase
    .from("classes")
    .select("id, name, branch_id, program_group_id")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  // Check name uniqueness if changing
  if (name !== undefined && name.trim().toLowerCase() !== current.name.toLowerCase()) {
    const nextBranchId =
      required.access?.recipient_type === "Branch"
        ? required.access.branch_id
        : branch_id ?? current.branch_id;
    const nextProgramGroupId = program_group_id ?? current.program_group_id;

    const { data: existing } = await supabase
      .from("classes")
      .select("id")
      .ilike("name", name.trim())
      .neq("id", id)
      .eq("branch_id", nextBranchId)
      .eq("program_group_id", nextProgramGroupId);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "A class with this name already exists" },
        { status: 409 }
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (category !== undefined) updates.category = category?.trim() || null;
  if (is_active !== undefined) updates.is_active = is_active;
  if (required.access?.recipient_type === "Branch") {
    updates.branch_id = required.access.branch_id;
  } else if (branch_id !== undefined) {
    updates.branch_id = branch_id;
  }
  if (program_group_id !== undefined) updates.program_group_id = program_group_id;

  let query = supabase.from("classes").update(updates).eq("id", id);

  if (required.access?.recipient_type === "Branch") {
    query = query.eq("branch_id", required.access.branch_id);
  }

  const { data, error } = await query.select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PATCH - Toggle is_active status (soft delete/restore)
export async function PATCH(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const supabase = createSupabaseServerClient();

  let body: { id: string; is_active: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, is_active } = body;

  if (!id || is_active === undefined) {
    return NextResponse.json(
      { error: "id and is_active are required" },
      { status: 400 }
    );
  }

  let query = supabase.from("classes").update({ is_active }).eq("id", id);

  if (required.access?.recipient_type === "Branch") {
    query = query.eq("branch_id", required.access.branch_id);
  }

  const { data, error } = await query.select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

