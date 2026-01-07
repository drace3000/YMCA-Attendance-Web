import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type ClassRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
};

type CreateClassPayload = {
  name: string;
  description?: string;
  category?: string;
};

type UpdateClassPayload = {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  is_active?: boolean;
};

// GET - List all classes or check name availability
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const checkName = searchParams.get("check_name");
  const excludeId = searchParams.get("exclude_id");
  const includeInactive = searchParams.get("include_inactive") === "true";

  const supabase = createSupabaseServerClient();

  // If checking name availability, return validation result
  if (checkName) {
    let query = supabase
      .from("classes")
      .select("id, name")
      .ilike("name", checkName.trim());

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
    .select("id, name, description, category, is_active, created_at")
    .order("name", { ascending: true });

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
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: CreateClassPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, category } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Check name uniqueness
  const { data: existing } = await supabase
    .from("classes")
    .select("id")
    .ilike("name", name.trim());

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
export async function PUT(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: UpdateClassPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, name, description, category, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Check if class exists
  const { data: current } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  // Check name uniqueness if changing
  if (name !== undefined && name.trim().toLowerCase() !== current.name.toLowerCase()) {
    const { data: existing } = await supabase
      .from("classes")
      .select("id")
      .ilike("name", name.trim())
      .neq("id", id);

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

  const { data, error } = await supabase
    .from("classes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// PATCH - Toggle is_active status (soft delete/restore)
export async function PATCH(req: Request) {
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

  const { data, error } = await supabase
    .from("classes")
    .update({ is_active })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

