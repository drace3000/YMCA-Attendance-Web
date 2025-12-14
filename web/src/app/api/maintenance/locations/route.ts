import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type LocationRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

type CreateLocationPayload = {
  code: string;
  name: string;
};

type UpdateLocationPayload = {
  id: string;
  code?: string;
  name?: string;
  is_active?: boolean;
};

// GET - List all locations or check code/name availability
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const checkCode = searchParams.get("check_code");
  const checkName = searchParams.get("check_name");
  const excludeId = searchParams.get("exclude_id");
  const includeInactive = searchParams.get("include_inactive") === "true";

  const supabase = createSupabaseServerClient();

  // If checking code availability
  if (checkCode) {
    let query = supabase
      .from("locations")
      .select("id, code")
      .ilike("code", checkCode.trim());

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const exists = (data?.length ?? 0) > 0;
    return NextResponse.json({ exists, field: "code" });
  }

  // If checking name availability
  if (checkName) {
    let query = supabase
      .from("locations")
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
    return NextResponse.json({ exists, field: "name" });
  }

  // Regular list query
  let query = supabase
    .from("locations")
    .select("id, code, name, is_active, created_at")
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

// POST - Create a new location
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: CreateLocationPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, name } = body;

  if (!code?.trim() || !name?.trim()) {
    return NextResponse.json(
      { error: "code and name are required" },
      { status: 400 }
    );
  }

  // Check code uniqueness
  const { data: existingCode } = await supabase
    .from("locations")
    .select("id")
    .ilike("code", code.trim());

  if (existingCode && existingCode.length > 0) {
    return NextResponse.json(
      { error: "A location with this code already exists" },
      { status: 409 }
    );
  }

  // Check name uniqueness
  const { data: existingName } = await supabase
    .from("locations")
    .select("id")
    .ilike("name", name.trim());

  if (existingName && existingName.length > 0) {
    return NextResponse.json(
      { error: "A location with this name already exists" },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("locations")
    .insert({
      code: code.trim(),
      name: name.trim(),
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT - Update a location
export async function PUT(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: UpdateLocationPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, code, name, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Check if location exists
  const { data: current } = await supabase
    .from("locations")
    .select("id, code, name")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  // Check code uniqueness if changing
  if (code !== undefined && code.trim().toLowerCase() !== current.code.toLowerCase()) {
    const { data: existing } = await supabase
      .from("locations")
      .select("id")
      .ilike("code", code.trim())
      .neq("id", id);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "A location with this code already exists" },
        { status: 409 }
      );
    }
  }

  // Check name uniqueness if changing
  if (name !== undefined && name.trim().toLowerCase() !== current.name.toLowerCase()) {
    const { data: existing } = await supabase
      .from("locations")
      .select("id")
      .ilike("name", name.trim())
      .neq("id", id);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "A location with this name already exists" },
        { status: 409 }
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (code !== undefined) updates.code = code.trim();
  if (name !== undefined) updates.name = name.trim();
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("locations")
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
    .from("locations")
    .update({ is_active })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
