type SupabaseClient = ReturnType<
  (typeof import("@/lib/supabaseServer"))["createSupabaseServerClient"]
>;

type BranchMetaRaw = {
  id: string;
  short_code: string | null;
  association: { code: string } | { code: string }[] | null;
};

type PlaceholderInstructor = { id: string; nickname: string };

type InstructorRow = {
  id: string;
  nickname: string | null;
  first_name: string | null;
  last_name: string | null;
};

type ClassLevelPair = {
  class_id: string;
  class_name: string | null;
  location_id: string;
  location_name: string | null;
  minutes: number;
};

const PLACEHOLDER_NICKNAME = "UNASSIGNED";
const PLACEHOLDER_FIRST_NAME = "Unassigned";
const PLACEHOLDER_LAST_NAME = "Instructor";
const AUTO_BACKFILL_SOURCE_FILE = "auto_backfill_from_class_level_unassigned";

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function sanitizeReadableIdPart(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9_-]/g, "");
}

async function getNextReadableId(supabase: SupabaseClient, base: string): Promise<string> {
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

export function buildInstructorLabel(row: InstructorRow): string {
  const nick = String(row.nickname ?? "").trim();
  if (nick) return nick;
  const full = `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim();
  if (full) return full;
  return String(row.id);
}

async function resolvePlaceholderInstructor(
  supabase: SupabaseClient,
  branchId: string,
): Promise<PlaceholderInstructor> {
  const { data: existing, error: existingError } = await supabase
    .from("instructors")
    .select("id, nickname")
    .ilike("nickname", PLACEHOLDER_NICKNAME)
    .eq("branch_id", branchId)
    .limit(1);

  if (existingError) throw new Error(existingError.message);

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

  const branchMetaRaw = branchMeta as unknown as BranchMetaRaw;
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

  const { error: linkError } = await supabase
    .from("instructor_branches")
    .upsert(
      { instructor_id: created.id, branch_id: branchId, is_primary: true },
      { onConflict: "instructor_id,branch_id" },
    );
  if (linkError) throw new Error(linkError.message);

  return { id: String(created.id), nickname: String(created.nickname ?? PLACEHOLDER_NICKNAME) };
}

async function getClassLevelPairs(opts: {
  supabase: SupabaseClient;
  branchId: string;
  placeholderInstructorId: string;
}): Promise<ClassLevelPair[]> {
  const { supabase, branchId, placeholderInstructorId } = opts;
  const { data, error } = await supabase
    .from("instructor_class_location_details")
    .select("class_id, class_name, location_id, location_name, minutes")
    .eq("branch_id", branchId)
    .eq("instructor_id", placeholderInstructorId)
    .returns<ClassLevelPair[]>();

  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    class_id: String(r.class_id),
    class_name: r.class_name ?? null,
    location_id: String(r.location_id),
    location_name: r.location_name ?? null,
    minutes: Number(r.minutes),
  }));
}

export async function autoBackfillIcldForInstructorInBranch(opts: {
  supabase: SupabaseClient;
  branchId: string;
  instructor: InstructorRow;
}): Promise<void> {
  const { supabase, branchId, instructor } = opts;

  const placeholder = await resolvePlaceholderInstructor(supabase, branchId);
  const pairs = await getClassLevelPairs({
    supabase,
    branchId,
    placeholderInstructorId: placeholder.id,
  });

  if (pairs.length === 0) return;

  const label = buildInstructorLabel(instructor);
  const rows = pairs.map((p) => ({
    branch_id: branchId,
    instructor_id: instructor.id,
    instructor_nickname: label,
    class_id: p.class_id,
    class_name: p.class_name ?? p.class_id,
    location_id: p.location_id,
    location_name: p.location_name ?? p.location_id,
    minutes: p.minutes,
    source_file: AUTO_BACKFILL_SOURCE_FILE,
  }));

  const { error } = await supabase.from("instructor_class_location_details").upsert(rows, {
    onConflict: "branch_id,instructor_id,class_id,location_id,minutes",
    ignoreDuplicates: true,
  });

  if (error) throw new Error(error.message);
}

