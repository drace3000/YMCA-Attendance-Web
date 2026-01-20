import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

export const runtime = "nodejs";

type ClassRel = { name: string };
type InstructorRel = { nickname: string | null; first_name: string | null; last_name: string | null };
type LocationRel = { code: string; name: string };
type InstructorRelFull = {
  id: string;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean | null;
};

type MappingRow = {
  id: string;
  class_id: string;
  class_name: string | null;
  class?: ClassRel | ClassRel[] | null;
  instructor_id: string;
  instructor_nickname: string | null;
  instructor?: InstructorRel | InstructorRel[] | null;
  location_id: string;
  location_name: string | null;
  location?: LocationRel | LocationRel[] | null;
  minutes: number;
};

type ApiRow = {
  id: string;
  class_id: string;
  class_name: string | null;
  class_label: string;
  instructor_id: string;
  instructor_nickname: string | null;
  instructor_label: string;
  location_id: string;
  location_name: string | null;
  location_label: string;
  minutes: number;
};

type BranchMetaRaw = {
  id: string;
  short_code: string | null;
  association: { code: string } | { code: string }[] | null;
};

type PlaceholderInstructor = { id: string; nickname: string };

const PLACEHOLDER_NICKNAME = "UNASSIGNED";
const PLACEHOLDER_FIRST_NAME = "Unassigned";
const PLACEHOLDER_LAST_NAME = "Instructor";
const PLACEHOLDER_SOURCE_FILE = "manual_class_ui";
const AUTO_BACKFILL_SOURCE_FILE = "auto_backfill_from_class_level_unassigned";

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function buildInstructorLabel(rel: InstructorRel | null, fallback: string | null, id: string): string {
  const nick = String(rel?.nickname ?? "").trim();
  if (nick) return nick;
  const full = `${String(rel?.first_name ?? "").trim()} ${String(rel?.last_name ?? "").trim()}`.trim();
  if (full) return full;
  const fb = String(fallback ?? "").trim();
  if (fb) return fb;
  return id;
}

function buildInstructorLabelFromRow(row: InstructorRelFull): string {
  const nick = String(row.nickname ?? "").trim();
  if (nick) return nick;
  const full = `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim();
  if (full) return full;
  return String(row.id);
}

async function getTargetInstructorsForBranch(opts: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  placeholderInstructorId: string;
}): Promise<Array<{ instructor_id: string; instructor_label: string }>> {
  const { supabase, branchId, placeholderInstructorId } = opts;

  const seen = new Map<string, string>();

  const { data: primary, error: primaryError } = await supabase
    .from("instructors")
    .select("id, nickname, first_name, last_name, is_active")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .returns<InstructorRelFull[]>();

  if (primaryError) throw new Error(primaryError.message);
  for (const row of primary ?? []) {
    const id = String(row.id);
    if (!id || id === placeholderInstructorId) continue;
    seen.set(id, buildInstructorLabelFromRow(row));
  }

  const { data: shared, error: sharedError } = await supabase
    .from("instructor_branches")
    .select("instructor_id, instructor:instructor_id (id, nickname, first_name, last_name, is_active)")
    .eq("branch_id", branchId)
    .returns<Array<{ instructor_id: string; instructor: InstructorRelFull | InstructorRelFull[] | null }>>();

  if (sharedError) throw new Error(sharedError.message);
  for (const row of shared ?? []) {
    const rel = normalizeRelation(row.instructor);
    const id = String(rel?.id ?? row.instructor_id ?? "");
    if (!id || id === placeholderInstructorId) continue;
    if (rel?.is_active === false) continue;
    const label = rel ? buildInstructorLabelFromRow(rel) : id;
    if (!seen.has(id)) seen.set(id, label);
  }

  return Array.from(seen.entries()).map(([instructor_id, instructor_label]) => ({
    instructor_id,
    instructor_label,
  }));
}

function buildLocationLabel(rel: LocationRel | null, fallback: string | null, id: string): string {
  if (rel?.code && rel?.name) return `${rel.code} - ${rel.name}`;
  const fb = String(fallback ?? "").trim();
  if (fb) return fb;
  return id;
}

function buildClassLabel(rel: ClassRel | null, fallback: string | null, id: string): string {
  const name = String(rel?.name ?? "").trim();
  if (name) return name;
  const fb = String(fallback ?? "").trim();
  if (fb) return fb;
  return id;
}

function resolveBranchId(opts: {
  access: { recipient_type: "Administrator" | "Branch"; branch_id: string } | null;
  requestedBranchId: string | null;
}): string | null {
  const { access, requestedBranchId } = opts;
  if (access?.recipient_type === "Branch") return access.branch_id;
  return requestedBranchId ?? access?.branch_id ?? null;
}

function sanitizeReadableIdPart(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "");
}

async function getNextReadableId(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  base: string,
): Promise<string> {
  const { data } = await supabase
    .from("instructors")
    .select("readable_id")
    .ilike("readable_id", `${base}%`)
    .returns<{ readable_id: string }[]>();

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

async function resolvePlaceholderInstructor(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  branchId: string,
): Promise<PlaceholderInstructor> {
  const { data: existing } = await supabase
    .from("instructors")
    .select("id, nickname")
    .ilike("nickname", PLACEHOLDER_NICKNAME)
    .eq("branch_id", branchId)
    .limit(1);

  const found = (existing ?? [])[0];
  if (found?.id) {
    return { id: String(found.id), nickname: String(found.nickname ?? PLACEHOLDER_NICKNAME) };
  }

  const { data: branchMeta, error: branchMetaError } = await supabase
    .from("ymca_branches")
    .select("id, short_code, association:ymca_associations(code)")
    .eq("id", branchId)
    .single();

  if (branchMetaError || !branchMeta) {
    throw new Error("Branch not found for placeholder instructor");
  }

  const branchMetaRaw = branchMeta as BranchMetaRaw;
  const assoc = Array.isArray(branchMetaRaw.association)
    ? branchMetaRaw.association[0] ?? null
    : branchMetaRaw.association;
  const assocCode = assoc?.code ?? "ASSOC";
  const branchShort = branchMetaRaw.short_code ?? "BR";

  const readableBase = `${sanitizeReadableIdPart(assocCode)}-${sanitizeReadableIdPart(
    branchShort,
  )}-${sanitizeReadableIdPart(PLACEHOLDER_NICKNAME)}`;
  const readable_id = await getNextReadableId(supabase, readableBase);

  const raw_name = `${PLACEHOLDER_FIRST_NAME} ${PLACEHOLDER_LAST_NAME}`;

  const { data: created, error: createError } = await supabase
    .from("instructors")
    .insert({
      first_name: PLACEHOLDER_FIRST_NAME,
      last_name: PLACEHOLDER_LAST_NAME,
      nickname: PLACEHOLDER_NICKNAME,
      raw_name,
      branch_id: branchId,
      readable_id,
      is_active: true,
    })
    .select("id, nickname")
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message || "Failed to create placeholder instructor");
  }

  await supabase
    .from("instructor_branches")
    .upsert(
      { instructor_id: created.id, branch_id: branchId, is_primary: true },
      { onConflict: "instructor_id,branch_id" },
    );

  return { id: String(created.id), nickname: String(created.nickname ?? PLACEHOLDER_NICKNAME) };
}

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const requestedBranchId = searchParams.get("branch_id")?.trim() || null;
  const classId = searchParams.get("class_id")?.trim() || null;
  const classOnly = searchParams.get("class_only") === "true";

  if ("devPassthrough" in required && required.devPassthrough) {
    if (!requestedBranchId) {
      return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
    }
  }

  const branchId = resolveBranchId({
    access: "access" in required ? required.access : null,
    requestedBranchId,
  });
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const placeholder = classId ? await resolvePlaceholderInstructor(supabase, branchId) : null;

  let query = supabase
    .from("instructor_class_location_details")
    .select(
      `
      id,
      class_id,
      class_name,
      class:class_id (name),
      instructor_id,
      instructor_nickname,
      instructor:instructor_id (nickname, first_name, last_name),
      location_id,
      location_name,
      location:location_id (code, name),
      minutes
    `,
    )
    .eq("branch_id", branchId);

  if (classId) query = query.eq("class_id", classId);
  if (classOnly && placeholder?.id) query = query.eq("instructor_id", placeholder.id);

  const { data, error } = await query.returns<MappingRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: ApiRow[] = (data ?? []).map((r) => {
    const classRel = normalizeRelation(r.class);
    const instructorRel = normalizeRelation(r.instructor);
    const locationRel = normalizeRelation(r.location);
    const rowId = String(r.id ?? "");
    const classId = String(r.class_id ?? "");
    const instId = String(r.instructor_id ?? "");
    const locId = String(r.location_id ?? "");

    return {
      id: rowId,
      class_id: classId,
      class_name: r.class_name ?? null,
      class_label: buildClassLabel(classRel, r.class_name ?? null, classId),
      instructor_id: instId,
      instructor_nickname: r.instructor_nickname ?? null,
      instructor_label: buildInstructorLabel(instructorRel, r.instructor_nickname ?? null, instId),
      location_id: locId,
      location_name: r.location_name ?? null,
      location_label: buildLocationLabel(locationRel, r.location_name ?? null, locId),
      minutes: Number(r.minutes),
    };
  });

  return NextResponse.json({
    rows,
    placeholder_instructor_id: placeholder?.id ?? null,
    placeholder_instructor_nickname: placeholder?.nickname ?? null,
  });
}

type CreateMappingItem = {
  location_id: string;
  minutes: number;
  class_name?: string | null;
  location_name?: string | null;
};

type CreateMappingPayload = {
  branch_id?: string;
  class_id: string;
  class_name?: string | null;
  instructor_id?: string | null;
  instructor_nickname?: string | null;
  items?: CreateMappingItem[];
  location_id?: string;
  minutes?: number;
  location_name?: string | null;
};

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const supabase = createSupabaseServerClient();

  let body: CreateMappingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const requestedBranchId = body.branch_id ?? null;
  const branchId = resolveBranchId({
    access: "access" in required ? required.access : null,
    requestedBranchId,
  });
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  const classId = body.class_id?.trim() || "";
  if (!classId) return NextResponse.json({ error: "class_id is required" }, { status: 400 });

  const items: CreateMappingItem[] =
    Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [
          {
            location_id: body.location_id ?? "",
            minutes: Number(body.minutes ?? 0),
            class_name: body.class_name ?? null,
            location_name: body.location_name ?? null,
          },
        ];

  const instructorId = normalizeText(body.instructor_id ?? "");
  const instructorNickname = normalizeText(body.instructor_nickname ?? "");
  const placeholder = instructorId ? null : await resolvePlaceholderInstructor(supabase, branchId);
  const resolvedInstructorId = instructorId || placeholder?.id || "";
  const resolvedInstructorNickname =
    instructorNickname || placeholder?.nickname || PLACEHOLDER_NICKNAME;

  const isClassLevelInsert = !instructorId && !!placeholder?.id;

  const inserts = items
    .map((item) => {
      const className = normalizeText(item.class_name ?? body.class_name ?? classId);
      const locationId = normalizeText(item.location_id);
      const locationName = normalizeText(item.location_name ?? body.location_name ?? locationId);
      const minutes = Number(item.minutes);

      return {
        class_id: classId,
        class_name: className || classId,
        instructor_id: resolvedInstructorId,
        instructor_nickname: resolvedInstructorNickname,
        location_id: locationId,
        location_name: locationName || locationId,
        minutes,
        branch_id: branchId,
        source_file: PLACEHOLDER_SOURCE_FILE,
      };
    })
    .filter(
      (item) =>
        item.location_id &&
        Number.isFinite(item.minutes) &&
        item.minutes > 0 &&
        item.instructor_id,
    );

  if (inserts.length === 0) {
    return NextResponse.json({ error: "location_id and minutes are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("instructor_class_location_details")
    .upsert(inserts, {
      onConflict: "branch_id,instructor_id,class_id,location_id,minutes",
      ignoreDuplicates: true,
    })
    .select("id, class_id, location_id, minutes, instructor_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Step 5: keep it fixed — whenever we add class-level (UNASSIGNED) pairs, ensure all instructors
  // also have rows for the same class/location/minutes combinations (idempotent upsert).
  if (isClassLevelInsert && placeholder?.id) {
    const targets = await getTargetInstructorsForBranch({
      supabase,
      branchId,
      placeholderInstructorId: placeholder.id,
    });

    if (targets.length > 0) {
      const classLevelPairs = inserts.map((r) => ({
        class_id: r.class_id,
        class_name: r.class_name,
        location_id: r.location_id,
        location_name: r.location_name,
        minutes: r.minutes,
      }));

      const backfill = targets.flatMap((t) =>
        classLevelPairs.map((p) => ({
          branch_id: branchId,
          instructor_id: t.instructor_id,
          instructor_nickname: t.instructor_label,
          class_id: p.class_id,
          class_name: p.class_name,
          location_id: p.location_id,
          location_name: p.location_name,
          minutes: p.minutes,
          source_file: AUTO_BACKFILL_SOURCE_FILE,
        })),
      );

      if (backfill.length > 0) {
        const { error: backfillError } = await supabase
          .from("instructor_class_location_details")
          .upsert(backfill, {
            onConflict: "branch_id,instructor_id,class_id,location_id,minutes",
            ignoreDuplicates: true,
          });

        if (backfillError) {
          return NextResponse.json({ error: backfillError.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ rows: data ?? [] }, { status: 201 });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const requestedBranchId = searchParams.get("branch_id")?.trim() || null;
  const classId = searchParams.get("class_id")?.trim() || null;
  const locationId = searchParams.get("location_id")?.trim() || null;
  const instructorId = searchParams.get("instructor_id")?.trim() || null;
  const minutesParam = searchParams.get("minutes")?.trim() || null;
  const id = searchParams.get("id")?.trim() || null;
  const scope = searchParams.get("scope")?.trim() || "placeholder";

  const branchId = resolveBranchId({
    access: "access" in required ? required.access : null,
    requestedBranchId,
  });
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  if (!id && !classId) {
    return NextResponse.json({ error: "id or class_id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const placeholder =
    scope === "all" || instructorId ? null : await resolvePlaceholderInstructor(supabase, branchId);

  let query = supabase
    .from("instructor_class_location_details")
    .delete()
    .eq("branch_id", branchId);

  if (instructorId) {
    query = query.eq("instructor_id", instructorId);
  } else if (placeholder?.id) {
    query = query.eq("instructor_id", placeholder.id);
  }

  if (id) {
    query = query.eq("id", id);
  } else {
    query = query.eq("class_id", classId);
    if (locationId) query = query.eq("location_id", locationId);
    if (minutesParam) {
      const minutes = Number(minutesParam);
      if (Number.isFinite(minutes)) {
        query = query.eq("minutes", minutes);
      }
    }
  }

  const { data, error } = await query.select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: (data ?? []).length });
}


