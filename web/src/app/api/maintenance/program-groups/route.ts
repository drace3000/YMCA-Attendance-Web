import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type ProgramGroupRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

type CreateProgramGroupPayload = {
  code?: string;
  name: string;
  description: string;
  sort_order?: number;
};

type UpdateProgramGroupPayload = {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
};

function toCodeFromName(name: string): string {
  // Convert "Youth Development" -> "YouthDevelopment"
  return name
    .trim()
    .replace(/[^a-zA-Z0-9 ]+/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// GET - list program groups (maintenance)
export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("program_groups")
    .select("id, code, name, description, sort_order, is_active, created_at")
    .order("sort_order", { ascending: true })
    .returns<ProgramGroupRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST - create program group
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: CreateProgramGroupPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  const description = body.description?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });

  const code = (body.code?.trim() || toCodeFromName(name)).slice(0, 64);
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  // Determine next sort order if not provided
  let sortOrder = body.sort_order;
  if (sortOrder === undefined || sortOrder === null) {
    const { data: maxRow } = await supabase
      .from("program_groups")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number }>();
    sortOrder = (maxRow?.sort_order ?? 0) + 1;
  }

  // Ensure code uniqueness
  const { data: existing } = await supabase
    .from("program_groups")
    .select("id")
    .eq("code", code)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    return NextResponse.json(
      { error: `code already exists: ${code}` },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("program_groups")
    .insert({
      code,
      name,
      description,
      sort_order: sortOrder,
      is_active: true,
    })
    .select("id, code, name, description, sort_order, is_active, created_at")
    .single<ProgramGroupRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// PUT - update program group
export async function PUT(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: UpdateProgramGroupPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.code !== undefined) updates.code = body.code?.trim() || null;
  if (body.name !== undefined) updates.name = body.name?.trim() || null;
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { data, error } = await supabase
    .from("program_groups")
    .update(updates)
    .eq("id", body.id)
    .select("id, code, name, description, sort_order, is_active, created_at")
    .single<ProgramGroupRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}


