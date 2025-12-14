import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type InstructorRow = {
  id: string;
  branch_id: string | null;
  raw_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  is_active: boolean;
  created_at: string;
};

type CreateInstructorPayload = {
  first_name: string;
  last_name: string;
  nickname?: string;
  branch_id?: string;
};

type UpdateInstructorPayload = {
  id: string;
  first_name?: string;
  last_name?: string;
  nickname?: string;
  is_active?: boolean;
};

// Generate nickname suggestions based on first and last name
function generateNicknameSuggestions(firstName: string, lastName: string): string[] {
  const first = firstName.trim().toUpperCase();
  const last = lastName.trim().toUpperCase();
  
  if (!first && !last) return [];
  
  const suggestions: string[] = [];
  
  if (first) {
    suggestions.push(first); // JOHN
  }
  
  if (first && last) {
    suggestions.push(`${first} ${last.charAt(0)}`); // JOHN S
    if (last.length >= 2) {
      suggestions.push(`${first} ${last.substring(0, 2)}`); // JOHN SM
    }
    suggestions.push(`${first.charAt(0)} ${last}`); // J SMITH
    suggestions.push(`${first} ${last}`); // JOHN SMITH
  }
  
  if (last && !first) {
    suggestions.push(last); // SMITH
  }
  
  return suggestions;
}

// GET - List all instructors or check nickname availability
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const checkNickname = searchParams.get("check_nickname");
  const branchId = searchParams.get("branch_id");
  const firstName = searchParams.get("first_name") || "";
  const lastName = searchParams.get("last_name") || "";
  const includeInactive = searchParams.get("include_inactive") === "true";

  const supabase = createSupabaseServerClient();

  // If checking nickname availability, return validation result with suggestions
  if (checkNickname) {
    const query = supabase
      .from("instructors")
      .select("id, nickname")
      .ilike("nickname", checkNickname);
    
    if (branchId) {
      query.eq("branch_id", branchId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const exists = (data?.length ?? 0) > 0;
    
    if (exists) {
      // Generate suggestions and filter out existing ones
      const allSuggestions = generateNicknameSuggestions(firstName, lastName);
      
      // Check which suggestions are available
      const { data: existingNicknames } = await supabase
        .from("instructors")
        .select("nickname")
        .eq("branch_id", branchId || "");

      const takenNicknames = new Set(
        (existingNicknames ?? []).map((r) => (r.nickname ?? "").toUpperCase())
      );

      const availableSuggestions = allSuggestions.filter(
        (s) => !takenNicknames.has(s.toUpperCase())
      );

      return NextResponse.json({
        exists: true,
        suggestions: availableSuggestions.slice(0, 4),
      });
    }

    return NextResponse.json({ exists: false, suggestions: [] });
  }

  // Regular list query
  let query = supabase
    .from("instructors")
    .select("id, branch_id, raw_name, first_name, last_name, nickname, is_active, created_at")
    .order("nickname", { ascending: true, nullsFirst: false });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// POST - Create a new instructor
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: CreateInstructorPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { first_name, last_name, nickname, branch_id } = body;

  if (!first_name?.trim() || !last_name?.trim()) {
    return NextResponse.json(
      { error: "first_name and last_name are required" },
      { status: 400 }
    );
  }

  // Check nickname uniqueness if provided
  if (nickname?.trim()) {
    const { data: existing } = await supabase
      .from("instructors")
      .select("id")
      .ilike("nickname", nickname.trim())
      .eq("branch_id", branch_id || "");

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "Nickname already exists for this branch" },
        { status: 409 }
      );
    }
  }

  const raw_name = `${first_name.trim()} ${last_name.trim()}`;

  const { data, error } = await supabase
    .from("instructors")
    .insert({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      nickname: nickname?.trim() || null,
      raw_name,
      branch_id: branch_id || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT - Update an instructor
export async function PUT(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: UpdateInstructorPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, first_name, last_name, nickname, is_active } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Get current instructor to check branch_id for nickname validation
  const { data: current } = await supabase
    .from("instructors")
    .select("id, branch_id, nickname")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Instructor not found" }, { status: 404 });
  }

  // Check nickname uniqueness if changing
  if (nickname !== undefined && nickname !== current.nickname) {
    const { data: existing } = await supabase
      .from("instructors")
      .select("id")
      .ilike("nickname", nickname?.trim() || "")
      .eq("branch_id", current.branch_id || "")
      .neq("id", id);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "Nickname already exists for this branch" },
        { status: 409 }
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (first_name !== undefined) updates.first_name = first_name.trim();
  if (last_name !== undefined) updates.last_name = last_name.trim();
  if (nickname !== undefined) updates.nickname = nickname?.trim() || null;
  if (is_active !== undefined) updates.is_active = is_active;

  // Update raw_name if names changed
  if (first_name !== undefined || last_name !== undefined) {
    const newFirst = first_name?.trim() ?? "";
    const newLast = last_name?.trim() ?? "";
    updates.raw_name = `${newFirst} ${newLast}`.trim();
  }

  const { data, error } = await supabase
    .from("instructors")
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
    .from("instructors")
    .update({ is_active })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
