import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type AvailabilityRow = {
  id: string;
  branch_id: string;
  instructor_id: string;
  schedule_month: string; // "YYYY-MM"
  day_of_week: string; // "MONDAY"..."SUNDAY"
  available_start: string; // time
  available_end: string; // time
  created_at: string;
  updated_at: string;
};

type AvailabilityInput = {
  schedule_month: string;
  day_of_week: string;
  available_start: string; // "HH:mm"
  available_end: string; // "HH:mm"
};

function normalizeTimeToHm(value: string): string {
  // "HH:mm:ss" -> "HH:mm"
  return (value || "").slice(0, 5);
}

function normalizeDay(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function isIsoMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function isValidDayOfWeek(value: string): boolean {
  const v = normalizeDay(value);
  return (
    v === "MONDAY" ||
    v === "TUESDAY" ||
    v === "WEDNESDAY" ||
    v === "THURSDAY" ||
    v === "FRIDAY" ||
    v === "SATURDAY" ||
    v === "SUNDAY"
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const requestedBranchId = (searchParams.get("branch_id") ?? "").trim() || null;
  const instructorId = (searchParams.get("instructor_id") ?? "").trim() || null;
  const month = (searchParams.get("month") ?? "").trim() || null; // "YYYY-MM"

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;

  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (month && !isIsoMonth(month)) {
    return NextResponse.json({ error: "month must be in format YYYY-MM" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("instructor_availability")
    .select(
      "id, branch_id, instructor_id, schedule_month, day_of_week, available_start, available_end, created_at, updated_at",
    )
    .eq("branch_id", branchId)
    .order("schedule_month", { ascending: false })
    .order("day_of_week", { ascending: true })
    .order("available_start", { ascending: true });

  if (instructorId) query = query.eq("instructor_id", instructorId);
  if (month) query = query.eq("schedule_month", month);

  const { data, error } = await query.returns<AvailabilityRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    ...r,
    day_of_week: normalizeDay(r.day_of_week),
    available_start: normalizeTimeToHm(r.available_start),
    available_end: normalizeTimeToHm(r.available_end),
  }));

  return NextResponse.json({ availability: rows });
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body:
    | {
        branch_id?: string;
        instructor_id?: string;
        items?: AvailabilityInput[];
      }
    | (Partial<AvailabilityRow> & {
        branch_id?: string;
        instructor_id?: string;
        schedule_month?: string;
        day_of_week?: string;
        available_start?: string;
        available_end?: string;
      });

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const access = required.access;
  const requestedBranchId = ("branch_id" in body ? (body.branch_id ?? "") : "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;

  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const instructorId = ("instructor_id" in body ? (body.instructor_id ?? "") : "").trim();
  if (!instructorId) {
    return NextResponse.json({ error: "instructor_id is required" }, { status: 400 });
  }

  const items: AvailabilityInput[] = Array.isArray((body as any).items)
    ? ((body as any).items as AvailabilityInput[])
    : [
        {
          schedule_month: String((body as any).schedule_month ?? "").trim(),
          day_of_week: String((body as any).day_of_week ?? "").trim(),
          available_start: String((body as any).available_start ?? "").trim(),
          available_end: String((body as any).available_end ?? "").trim(),
        },
      ];

  if (items.length === 0) {
    return NextResponse.json({ error: "items must not be empty" }, { status: 400 });
  }

  for (const it of items) {
    if (!it.schedule_month || !isIsoMonth(it.schedule_month)) {
      return NextResponse.json({ error: "schedule_month must be in format YYYY-MM" }, { status: 400 });
    }
    if (!it.day_of_week || !isValidDayOfWeek(it.day_of_week)) {
      return NextResponse.json({ error: "day_of_week must be MONDAY..SUNDAY" }, { status: 400 });
    }
    if (!it.available_start || !it.available_end) {
      return NextResponse.json({ error: "available_start and available_end are required" }, { status: 400 });
    }
  }

  const supabase = createSupabaseServerClient();

  const insertRows = items.map((it) => ({
    branch_id: branchId,
    instructor_id: instructorId,
    schedule_month: it.schedule_month,
    day_of_week: normalizeDay(it.day_of_week),
    available_start: it.available_start,
    available_end: it.available_end,
  }));

  const { data, error } = await supabase
    .from("instructor_availability")
    .insert(insertRows)
    .select(
      "id, branch_id, instructor_id, schedule_month, day_of_week, available_start, available_end, created_at, updated_at",
    )
    .returns<AvailabilityRow[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((r) => ({
    ...r,
    day_of_week: normalizeDay(r.day_of_week),
    available_start: normalizeTimeToHm(r.available_start),
    available_end: normalizeTimeToHm(r.available_end),
  }));

  return NextResponse.json({ availability: rows }, { status: 201 });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: {
    id: string;
    branch_id?: string;
    schedule_month?: string;
    day_of_week?: string;
    available_start?: string;
    available_end?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const access = required.access;
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};

  if (body.schedule_month !== undefined) {
    const m = String(body.schedule_month ?? "").trim();
    if (!isIsoMonth(m)) return NextResponse.json({ error: "schedule_month must be in format YYYY-MM" }, { status: 400 });
    patch.schedule_month = m;
  }
  if (body.day_of_week !== undefined) {
    const d = String(body.day_of_week ?? "").trim();
    if (!isValidDayOfWeek(d)) return NextResponse.json({ error: "day_of_week must be MONDAY..SUNDAY" }, { status: 400 });
    patch.day_of_week = normalizeDay(d);
  }
  if (body.available_start !== undefined) patch.available_start = String(body.available_start ?? "").trim();
  if (body.available_end !== undefined) patch.available_end = String(body.available_end ?? "").trim();

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("instructor_availability")
    .update(patch)
    .eq("id", id)
    .eq("branch_id", branchId)
    .select(
      "id, branch_id, instructor_id, schedule_month, day_of_week, available_start, available_end, created_at, updated_at",
    )
    .maybeSingle<AvailabilityRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    availability: {
      ...data,
      day_of_week: normalizeDay(data.day_of_week),
      available_start: normalizeTimeToHm(data.available_start),
      available_end: normalizeTimeToHm(data.available_end),
    },
  });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  const requestedBranchId = (searchParams.get("branch_id") ?? "").trim() || null;

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("instructor_availability")
    .delete()
    .eq("id", id)
    .eq("branch_id", branchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

