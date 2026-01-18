import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

export const runtime = "nodejs";

type ClassRel = { name: string };
type InstructorRel = { nickname: string | null; first_name: string | null; last_name: string | null };
type LocationRel = { code: string; name: string };

type MappingRow = {
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

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const requestedBranchId = searchParams.get("branch_id")?.trim() || null;

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

  const { data, error } = await supabase
    .from("instructor_class_location_details")
    .select(
      `
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
    .eq("branch_id", branchId)
    .returns<MappingRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: ApiRow[] = (data ?? []).map((r) => {
    const classRel = normalizeRelation(r.class);
    const instructorRel = normalizeRelation(r.instructor);
    const locationRel = normalizeRelation(r.location);
    const classId = String(r.class_id ?? "");
    const instId = String(r.instructor_id ?? "");
    const locId = String(r.location_id ?? "");

    return {
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

  return NextResponse.json({ rows });
}


