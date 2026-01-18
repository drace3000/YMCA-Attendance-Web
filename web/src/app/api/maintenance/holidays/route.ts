import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type HolidayRow = {
  id: string;
  branch_id: string;
  holiday_date: string; // "YYYY-MM-DD"
  observed_date?: string | null; // "YYYY-MM-DD"
  name: string;
  notes: string | null;
  is_active: boolean;
  is_closed?: boolean;
  closed_start_time?: string | null; // "HH:mm" or "HH:mm:ss"
  closed_end_time?: string | null; // "HH:mm" or "HH:mm:ss"
  import_source?: string | null;
  created_at: string;
  updated_at?: string;
};

type CreateHolidayPayload = {
  branch_id?: string;
  holiday_date: string;
  observed_date?: string | null;
  name: string;
  notes?: string | null;
  is_closed?: boolean;
  closed_start_time?: string | null;
  closed_end_time?: string | null;
};

type UpdateHolidayPayload = {
  id: string;
  branch_id?: string;
  holiday_date?: string;
  observed_date?: string | null;
  name?: string;
  notes?: string | null;
  is_active?: boolean;
  is_closed?: boolean;
  closed_start_time?: string | null;
  closed_end_time?: string | null;
};

function isIsoMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function normalizeHm(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  // Postgres time may come back as HH:mm:ss; accept both but normalize to HH:mm.
  const hhmm = v.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null;
}

function parseHmToMinutes(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^\d{2}:\d{2}$/.test(v)) return null;
  const hh = Number(v.slice(0, 2));
  const mm = Number(v.slice(3, 5));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function validateClosedWindow(input: {
  closedStart: string | null;
  closedEnd: string | null;
}): { ok: true; closedStart: string | null; closedEnd: string | null } | { ok: false; error: string } {
  const start = normalizeHm(input.closedStart);
  const end = normalizeHm(input.closedEnd);

  if (!start && !end) return { ok: true, closedStart: null, closedEnd: null };
  if (!start || !end) return { ok: false, error: "Both closed start and end time are required when using a time window" };

  const startMin = parseHmToMinutes(start);
  const endMin = parseHmToMinutes(end);
  if (startMin === null || endMin === null) return { ok: false, error: "Invalid time format (expected HH:mm)" };
  if (endMin <= startMin) return { ok: false, error: "Closed end time must be after start time" };

  return { ok: true, closedStart: start, closedEnd: end };
}

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("include_inactive") === "true";
  const requestedBranchId = searchParams.get("branch_id");
  const month = (searchParams.get("month") ?? "").trim() || null; // "YYYY-MM"

  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;

  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("holidays")
    .select(
      "id, branch_id, holiday_date, observed_date, name, notes, is_active, is_closed, closed_start_time, closed_end_time, import_source, created_at, updated_at",
    )
    .eq("branch_id", branchId)
    .order("holiday_date", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.returns<HolidayRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (month && isIsoMonth(month)) {
    rows = rows.filter((r) => typeof r.holiday_date === "string" && r.holiday_date.startsWith(month));
  }

  // Normalize time fields to HH:mm for the UI.
  const normalized = rows.map((r) => ({
    ...r,
    is_closed: !!r.is_closed,
    closed_start_time: normalizeHm(r.closed_start_time ?? null),
    closed_end_time: normalizeHm(r.closed_end_time ?? null),
    observed_date: typeof r.observed_date === "string" ? r.observed_date.slice(0, 10) : null,
    import_source: r.import_source ?? null,
  }));

  return NextResponse.json(normalized);
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: CreateHolidayPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const access = required.access;
  const requestedBranchId = body.branch_id;
  const branch_id =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;

  if (!branch_id) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  const holiday_date = (body.holiday_date ?? "").trim();
  const observed_date_raw = (body.observed_date ?? null) ? String(body.observed_date).trim() : null;
  const name = (body.name ?? "").trim();
  const notes = body.notes ?? null;
  const isClosed = body.is_closed === true;
  const closedStartRaw = body.closed_start_time ?? null;
  const closedEndRaw = body.closed_end_time ?? null;
  if (!holiday_date || !name) {
    return NextResponse.json({ error: "holiday_date and name are required" }, { status: 400 });
  }
  const observed_date = observed_date_raw && /^\d{4}-\d{2}-\d{2}$/.test(observed_date_raw) ? observed_date_raw : null;

  const closedWindow = validateClosedWindow({ closedStart: closedStartRaw, closedEnd: closedEndRaw });
  if (!closedWindow.ok) return NextResponse.json({ error: closedWindow.error }, { status: 400 });

  const supabase = createSupabaseServerClient();

  // Enforce unique (branch_id, holiday_date) at app level for a friendly message.
  const { data: existing, error: existsError } = await supabase
    .from("holidays")
    .select("id")
    .eq("branch_id", branch_id)
    .eq("holiday_date", holiday_date);

  if (existsError) return NextResponse.json({ error: existsError.message }, { status: 500 });
  if ((existing?.length ?? 0) > 0) {
    return NextResponse.json({ error: "A holiday already exists for this date" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("holidays")
    .insert({
      branch_id,
      holiday_date,
      observed_date,
      name,
      notes,
      is_active: true,
      is_closed: isClosed || (closedWindow.closedStart !== null && closedWindow.closedEnd !== null),
      closed_start_time: closedWindow.closedStart,
      closed_end_time: closedWindow.closedEnd,
      import_source: null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: UpdateHolidayPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("holidays")
    .select("id, branch_id, holiday_date")
    .eq("id", id)
    .maybeSingle<Pick<HolidayRow, "id" | "branch_id" | "holiday_date">>();

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = required.access;
  if (access?.recipient_type === "Branch" && current.branch_id !== access.branch_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.holiday_date !== undefined) patch.holiday_date = body.holiday_date;
  if (body.observed_date !== undefined) {
    const raw = body.observed_date ? String(body.observed_date).trim() : "";
    patch.observed_date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  }
  if (body.is_closed !== undefined) patch.is_closed = body.is_closed === true;

  const wantsClosedTimeUpdate = body.closed_start_time !== undefined || body.closed_end_time !== undefined;
  if (wantsClosedTimeUpdate) {
    const closedWindow = validateClosedWindow({
      closedStart: body.closed_start_time ?? null,
      closedEnd: body.closed_end_time ?? null,
    });
    if (!closedWindow.ok) return NextResponse.json({ error: closedWindow.error }, { status: 400 });
    patch.closed_start_time = closedWindow.closedStart;
    patch.closed_end_time = closedWindow.closedEnd;

    // If a time window exists, it implies closed.
    if (closedWindow.closedStart !== null && closedWindow.closedEnd !== null) {
      patch.is_closed = true;
    }
  }

  // If changing date, enforce uniqueness for branch.
  if (body.holiday_date && body.holiday_date !== current.holiday_date) {
    const { data: existing, error: existsError } = await supabase
      .from("holidays")
      .select("id")
      .eq("branch_id", current.branch_id)
      .eq("holiday_date", body.holiday_date)
      .neq("id", id);

    if (existsError) return NextResponse.json({ error: existsError.message }, { status: 500 });
    if ((existing?.length ?? 0) > 0) {
      return NextResponse.json({ error: "A holiday already exists for this date" }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("holidays")
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: { id: string; is_active: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("holidays")
    .select("id, branch_id")
    .eq("id", id)
    .maybeSingle<{ id: string; branch_id: string }>();

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = required.access;
  if (access?.recipient_type === "Branch" && current.branch_id !== access.branch_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("holidays")
    .update({ is_active: body.is_active })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = createSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from("holidays")
    .select("id, branch_id")
    .eq("id", id)
    .maybeSingle<{ id: string; branch_id: string }>();

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = required.access;
  if (access?.recipient_type === "Branch" && current.branch_id !== access.branch_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

