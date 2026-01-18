import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type InstructorRow = {
  id: string;
  branch_id: string | null;
  raw_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  readable_id: string;
  is_active: boolean;
  created_at: string;
};

type InstructorBranchLink = {
  instructor_id: string;
  branch_id: string;
  is_primary: boolean | null;
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

function sanitizeReadableIdPart(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "") // keep ids compact and consistent with existing backfill
    .replace(/[^A-Z0-9_-]/g, "");
}

type AssociationMeta = { code: string };

type BranchMetaRaw = {
  id: string;
  short_code: string;
  association: AssociationMeta | AssociationMeta[] | null;
};

type BranchMeta = {
  id: string;
  short_code: string;
  association: AssociationMeta | null;
};

async function getNextReadableId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  base: string,
): Promise<string> {
  // Find existing IDs with the same base (e.g., BASE, BASE-2, BASE-3)
  const { data, error } = await supabase
    .from("instructors")
    .select("readable_id")
    .ilike("readable_id", `${base}%`)
    .returns<{ readable_id: string }[]>();

  if (error) {
    // Fall back to base; let the unique index enforce if needed.
    return base;
  }

  const existing = new Set((data ?? []).map((r) => r.readable_id));
  if (!existing.has(base)) return base;

  let maxSuffix = 1;
  for (const id of existing) {
    const m = id.match(new RegExp(`^${base}-(\\d+)$`));
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) maxSuffix = Math.max(maxSuffix, n);
    }
  }

  return `${base}-${maxSuffix + 1}`;
}

// GET - List all instructors or check nickname availability
export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const checkNickname = searchParams.get("check_nickname");
  const requestedBranchId = searchParams.get("branch_id");
  const firstName = searchParams.get("first_name") || "";
  const lastName = searchParams.get("last_name") || "";
  const includeInactive = searchParams.get("include_inactive") === "true";

  const supabase = createSupabaseServerClient();

  const access = required.access;
  const isBranchUser = access?.recipient_type === "Branch";
  const branchId =
    isBranchUser && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
  if (!branchId) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  // Linked instructors for this branch (shared instructors)
  const { data: linkedRows, error: linkedError } = await supabase
    .from("instructor_branches")
    .select("instructor_id")
    .eq("branch_id", branchId);

  if (linkedError) {
    return NextResponse.json({ error: linkedError.message }, { status: 500 });
  }

  const linkedIds = (linkedRows ?? [])
    .map((r: { instructor_id: string }) => r.instructor_id)
    .filter(Boolean);

  // If checking nickname availability, return validation result with suggestions
  if (checkNickname) {
    const nickname = checkNickname.trim();

    const ownedQuery = supabase
      .from("instructors")
      .select("id, nickname")
      .ilike("nickname", nickname)
      .eq("branch_id", branchId);

    const linkedQuery =
      linkedIds.length > 0
        ? supabase
            .from("instructors")
            .select("id, nickname")
            .ilike("nickname", nickname)
            .in("id", linkedIds)
        : null;

    const [{ data: ownedData, error: ownedError }, linkedRes] = await Promise.all([
      ownedQuery,
      linkedQuery ? linkedQuery : Promise.resolve({ data: [], error: null }),
    ]);

    const linkedData = (linkedRes as any)?.data ?? [];
    const error = ownedError ?? (linkedRes as any)?.error ?? null;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const merged = [...(ownedData ?? []), ...(linkedData ?? [])];
    const exists = (merged.length ?? 0) > 0;
    
    if (exists) {
      // Generate suggestions and filter out existing ones
      const allSuggestions = generateNicknameSuggestions(firstName, lastName);
      
      // Check which suggestions are available
      const ownedNickQuery = supabase
        .from("instructors")
        .select("nickname")
        .eq("branch_id", branchId);

      const linkedNickQuery =
        linkedIds.length > 0
          ? supabase
              .from("instructors")
              .select("nickname")
              .in("id", linkedIds)
          : null;

      const [{ data: ownedNicknames, error: nickErr }, linkedNickRes] =
        await Promise.all([
          ownedNickQuery,
          linkedNickQuery ? linkedNickQuery : Promise.resolve({ data: [], error: null }),
        ]);

      if (nickErr || (linkedNickRes as any)?.error) {
        return NextResponse.json(
          { error: (nickErr ?? (linkedNickRes as any)?.error)?.message ?? "Failed to validate nickname" },
          { status: 500 },
        );
      }

      const existingNicknames = [
        ...(ownedNicknames ?? []),
        ...(((linkedNickRes as any)?.data ?? []) as any[]),
      ];

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
  const ownedListQuery = supabase
    .from("instructors")
    .select("id, branch_id, raw_name, first_name, last_name, nickname, readable_id, is_active, created_at")
    .eq("branch_id", branchId);

  const linkedListQuery =
    linkedIds.length > 0
      ? supabase
          .from("instructors")
          .select("id, branch_id, raw_name, first_name, last_name, nickname, readable_id, is_active, created_at")
          .in("id", linkedIds)
      : null;

  if (!includeInactive) {
    // Apply active filter to both queries
    (ownedListQuery as any).eq("is_active", true);
    if (linkedListQuery) (linkedListQuery as any).eq("is_active", true);
  }

  const [{ data: owned, error: ownedErr }, linkedListRes] = await Promise.all([
    ownedListQuery,
    linkedListQuery ? linkedListQuery : Promise.resolve({ data: [], error: null }),
  ]);

  const linked = (linkedListRes as any)?.data ?? [];
  const error = ownedErr ?? (linkedListRes as any)?.error ?? null;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byId = new Map<string, InstructorRow>();
  for (const row of [...(owned ?? []), ...(linked ?? [])]) {
    if (row?.id) byId.set(row.id, row);
  }

  const merged = Array.from(byId.values()).sort((a, b) =>
    (a.nickname ?? "").localeCompare(b.nickname ?? "", undefined, { sensitivity: "base" })
  );

  const mergedIds = merged.map((r) => r.id).filter(Boolean);
  if (mergedIds.length === 0) return NextResponse.json(merged);

  const { data: branchLinks, error: branchLinksError } = await supabase
    .from("instructor_branches")
    .select("instructor_id, branch_id, is_primary")
    .in("instructor_id", mergedIds)
    .returns<InstructorBranchLink[]>();

  if (branchLinksError) {
    return NextResponse.json({ error: branchLinksError.message }, { status: 500 });
  }

  const linksByInstructorId = new Map<string, InstructorBranchLink[]>();
  for (const row of branchLinks ?? []) {
    if (!row?.instructor_id || !row?.branch_id) continue;
    const arr = linksByInstructorId.get(row.instructor_id) ?? [];
    arr.push(row);
    linksByInstructorId.set(row.instructor_id, arr);
  }

  const output = merged.map((inst) => {
    const links = linksByInstructorId.get(inst.id) ?? [];
    const unique = new Map<string, InstructorBranchLink>();
    for (const link of links) {
      unique.set(link.branch_id, link);
    }
    // Ensure home branch appears even if legacy data is missing instructor_branches rows.
    if (inst.branch_id && !unique.has(inst.branch_id)) {
      unique.set(inst.branch_id, {
        instructor_id: inst.id,
        branch_id: inst.branch_id,
        is_primary: true,
      });
    }

    const available_branches = Array.from(unique.values()).sort((a, b) => {
      const aPrimary = a.is_primary ? 1 : 0;
      const bPrimary = b.is_primary ? 1 : 0;
      if (aPrimary !== bPrimary) return bPrimary - aPrimary;
      return a.branch_id.localeCompare(b.branch_id);
    });

    return { ...inst, available_branches };
  });

  return NextResponse.json(output);
}

// POST - Create a new instructor
export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const supabase = createSupabaseServerClient();

  let body: CreateInstructorPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedBranchId = body.branch_id;
  const access = required.access;
  const branch_id = access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;
  const { first_name, last_name, nickname } = body;

  if (!first_name?.trim() || !last_name?.trim()) {
    return NextResponse.json(
      { error: "first_name and last_name are required" },
      { status: 400 }
    );
  }

  if (!branch_id) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  const trimmedNickname = nickname?.trim();
  if (!trimmedNickname) {
    // We use nickname for schedules and for readable_id generation.
    return NextResponse.json({ error: "nickname is required" }, { status: 400 });
  }

  // Check nickname uniqueness if provided
  if (trimmedNickname) {
    let nickQuery = supabase
      .from("instructors")
      .select("id")
      .ilike("nickname", trimmedNickname);
    nickQuery = nickQuery.eq("branch_id", branch_id);
    const { data: existing } = await nickQuery;

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "Nickname already exists for this branch" },
        { status: 409 }
      );
    }
  }

  const raw_name = `${first_name.trim()} ${last_name.trim()}`;

  // Build readable_id (stable and memorable): ASSOC-BRANCHSHORT-NICKNAME
  const { data: branchMetaData, error: branchMetaError } = await supabase
    .from("ymca_branches")
    .select("id, short_code, association:ymca_associations(code)")
    .eq("id", branch_id)
    .single();

  if (branchMetaError || !branchMetaData) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Cast to handle Supabase returning association as array
  const branchMetaRaw = branchMetaData as unknown as BranchMetaRaw;
  
  // Handle association being returned as array by Supabase
  const association = Array.isArray(branchMetaRaw.association)
    ? branchMetaRaw.association[0] ?? null
    : branchMetaRaw.association;

  const assocCode = association?.code;
  const branchShort = branchMetaRaw.short_code;
  if (!assocCode || !branchShort) {
    return NextResponse.json(
      { error: "Branch hierarchy metadata missing (association code / short_code)" },
      { status: 500 },
    );
  }

  const baseReadableId = `${sanitizeReadableIdPart(assocCode)}-${sanitizeReadableIdPart(branchShort)}-${sanitizeReadableIdPart(trimmedNickname)}`;
  const readable_id = await getNextReadableId(supabase, baseReadableId);

  const { data, error } = await supabase
    .from("instructors")
    .insert({
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      nickname: trimmedNickname,
      raw_name,
      branch_id,
      readable_id,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ensure instructor_branches has the primary branch link for cross-branch scheduling
  await supabase
    .from("instructor_branches")
    .upsert(
      { instructor_id: data.id, branch_id, is_primary: true },
      { onConflict: "instructor_id,branch_id" },
    );

  return NextResponse.json(data, { status: 201 });
}

// PUT - Update an instructor
export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

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
    .select("id, branch_id, nickname, first_name, last_name")
    .eq("id", id)
    .single();

  if (!current) {
    return NextResponse.json({ error: "Instructor not found" }, { status: 404 });
  }

  // Branch users may only update instructors that are in-scope (owned OR linked).
  const access = required.access;
  if (access?.recipient_type === "Branch") {
    const branchId = access.branch_id;
    const isOwned = current.branch_id === branchId;
    if (!isOwned) {
      const { data: link } = await supabase
        .from("instructor_branches")
        .select("instructor_id")
        .eq("branch_id", branchId)
        .eq("instructor_id", id)
        .maybeSingle();
      if (!link) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  // Check nickname uniqueness if changing
  if (nickname !== undefined && nickname !== current.nickname && nickname?.trim()) {
    let nickQuery = supabase
      .from("instructors")
      .select("id")
      .ilike("nickname", nickname.trim())
      .neq("id", id);
    if (current.branch_id) {
      nickQuery = nickQuery.eq("branch_id", current.branch_id);
    } else {
      nickQuery = nickQuery.is("branch_id", null);
    }
    const { data: existing } = await nickQuery;

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

  // Update raw_name if names changed, preserving existing values as fallback
  if (first_name !== undefined || last_name !== undefined) {
    const newFirst = first_name !== undefined ? first_name.trim() : (current.first_name ?? "");
    const newLast = last_name !== undefined ? last_name.trim() : (current.last_name ?? "");
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

  const access = required.access;
  if (access?.recipient_type === "Branch") {
    const branchId = access.branch_id;
    const { data: current } = await supabase
      .from("instructors")
      .select("id, branch_id")
      .eq("id", id)
      .single();

    if (!current) {
      return NextResponse.json({ error: "Instructor not found" }, { status: 404 });
    }

    const isOwned = current.branch_id === branchId;
    if (!isOwned) {
      const { data: link } = await supabase
        .from("instructor_branches")
        .select("instructor_id")
        .eq("branch_id", branchId)
        .eq("instructor_id", id)
        .maybeSingle();
      if (!link) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
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

