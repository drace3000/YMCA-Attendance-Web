import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type UnavailabilityRow = {
  id: string;
  branch_id: string;
  instructor_id: string;
  date: string | null;
  day_of_week: string | null;
  unavailable_start: string;
  unavailable_end: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeTimeToHm(value: string): string {
  // "HH:mm:ss" -> "HH:mm"
  return (value || "").slice(0, 5);
}

function normalizeDay(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return v.toUpperCase();
}

function isIsoMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function monthDateRange(month: string): { start: string; end: string } {
  // month: "YYYY-MM"
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  // Use UTC to avoid timezone drift.
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toIsoDate(start), end: toIsoDate(end) };
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

  const supabase = createSupabaseServerClient();

  // We intentionally avoid gte/lte/or operators to keep test mocks simple.
  // If month is provided, we filter date-based rules in-memory after fetch.
  let query = supabase
    .from("instructor_unavailability")
    .select(
      "id, branch_id, instructor_id, date, day_of_week, unavailable_start, unavailable_end, reason, created_at, updated_at",
    )
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false });

  if (instructorId) query = query.eq("instructor_id", instructorId);

  const { data, error } = await query.returns<UnavailabilityRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []).map((r) => ({
    ...r,
    day_of_week: r.day_of_week ? normalizeDay(r.day_of_week) : null,
    unavailable_start: normalizeTimeToHm(r.unavailable_start),
    unavailable_end: normalizeTimeToHm(r.unavailable_end),
  }));

  if (month && isIsoMonth(month)) {
    const { start, end } = monthDateRange(month);
    rows = rows.filter((r) => {
      if (!r.date) return true; // recurring rules always included
      return r.date >= start && r.date <= end;
    });
  }

  return NextResponse.json({ unavailability: rows });
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: Partial<UnavailabilityRow> & {
    branch_id?: string;
    instructor_id?: string;
    date?: string | null;
    day_of_week?: string | null;
    unavailable_start?: string;
    unavailable_end?: string;
    reason?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const access = required.access;
  const requestedBranchId = (body.branch_id ?? "").trim() || null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;

  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const instructorId = (body.instructor_id ?? "").trim();
  const date = (body.date ?? null) ? String(body.date) : null;
  const dayOfWeek = normalizeDay(body.day_of_week ?? null);
  const start = (body.unavailable_start ?? "").trim();
  const end = (body.unavailable_end ?? "").trim();
  const reason = (body.reason ?? null) ? String(body.reason) : null;

  if (!instructorId) return NextResponse.json({ error: "instructor_id is required" }, { status: 400 });
  if (!start || !end) return NextResponse.json({ error: "unavailable_start and unavailable_end are required" }, { status: 400 });
  if (!date && !dayOfWeek) return NextResponse.json({ error: "Either date or day_of_week is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("instructor_unavailability")
    .insert({
      branch_id: branchId,
      instructor_id: instructorId,
      date,
      day_of_week: dayOfWeek,
      unavailable_start: start,
      unavailable_end: end,
      reason,
    })
    .select(
      "id, branch_id, instructor_id, date, day_of_week, unavailable_start, unavailable_end, reason, created_at, updated_at",
    )
    .single<UnavailabilityRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    unavailability: {
      ...data,
      day_of_week: data.day_of_week ? normalizeDay(data.day_of_week) : null,
      unavailable_start: normalizeTimeToHm(data.unavailable_start),
      unavailable_end: normalizeTimeToHm(data.unavailable_end),
    },
  });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: {
    id: string;
    branch_id?: string;
    instructor_id?: string;
    date?: string | null;
    day_of_week?: string | null;
    unavailable_start?: string;
    unavailable_end?: string;
    reason?: string | null;
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
  if (body.instructor_id) patch.instructor_id = body.instructor_id;
  if (body.date !== undefined) patch.date = body.date;
  if (body.day_of_week !== undefined) patch.day_of_week = normalizeDay(body.day_of_week);
  if (body.unavailable_start) patch.unavailable_start = body.unavailable_start;
  if (body.unavailable_end) patch.unavailable_end = body.unavailable_end;
  if (body.reason !== undefined) patch.reason = body.reason;

  const supabase = createSupabaseServerClient();

  // Enforce branch scoping in the where clause.
  const { data, error } = await supabase
    .from("instructor_unavailability")
    .update(patch)
    .eq("id", id)
    .eq("branch_id", branchId)
    .select(
      "id, branch_id, instructor_id, date, day_of_week, unavailable_start, unavailable_end, reason, created_at, updated_at",
    )
    .maybeSingle<UnavailabilityRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    unavailability: {
      ...data,
      day_of_week: data.day_of_week ? normalizeDay(data.day_of_week) : null,
      unavailable_start: normalizeTimeToHm(data.unavailable_start),
      unavailable_end: normalizeTimeToHm(data.unavailable_end),
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
    .from("instructor_unavailability")
    .delete()
    .eq("id", id)
    .eq("branch_id", branchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

