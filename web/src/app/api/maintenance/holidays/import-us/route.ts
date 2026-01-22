import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { loadUsFederalHolidaysJson, type UsHolidaysJson } from "@/lib/us-federal-holidays-source";

const IMPORT_SOURCE = "US_FEDERAL" as const;

type ImportPayload = {
  branch_id?: string;
  year?: number | string;
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test((value ?? "").trim());
}

function parseYear(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const y = Math.trunc(value);
    if (y < 1900 || y > 3000) return null;
    return y;
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^\d{4}$/.test(s)) return null;
  const y = Number(s);
  if (!Number.isFinite(y) || y < 1900 || y > 3000) return null;
  return y;
}

function assertYearSupported(year: number, availableYears: number[]): { ok: true } | { ok: false; error: string } {
  if (!availableYears.includes(year)) {
    const min = availableYears.length > 0 ? availableYears[0] : null;
    const max = availableYears.length > 0 ? availableYears[availableYears.length - 1] : null;
    const range = min && max ? `${min}–${max}` : "no years available";
    return { ok: false, error: `Unsupported year ${year} (available: ${range})` };
  }
  return { ok: true };
}

function extractAvailableYears(json: UsHolidaysJson): number[] {
  const years = new Set<number>();
  for (const h of json.holidays ?? []) {
    const dates = h?.dates ?? {};
    for (const k of Object.keys(dates)) {
      const y = Number(k);
      if (Number.isFinite(y) && y >= 1900 && y <= 3000) years.add(y);
    }
  }
  return Array.from(years).sort((a, b) => a - b);
}

type ExpectedHolidayDate = { date: string; observed: string | null };

function buildExpectedByYear(json: UsHolidaysJson): Map<number, ExpectedHolidayDate[]> {
  const map = new Map<number, ExpectedHolidayDate[]>();
  for (const h of json.holidays ?? []) {
    const dates = h?.dates ?? {};
    for (const [yearKey, entry] of Object.entries(dates)) {
      const y = Number(yearKey);
      if (!Number.isFinite(y)) continue;

      const actual = String(entry?.date ?? "").trim();
      const observed = String(entry?.observed ?? "").trim();

      if (!isIsoDate(actual)) continue;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push({
        date: actual,
        observed: observed && isIsoDate(observed) ? observed : null,
      });
    }
  }
  return map;
}

async function computeMissingYears({
  supabase,
  branchId,
  json,
}: {
  supabase: ReturnType<typeof createSupabaseServerClient>;
  branchId: string;
  json: UsHolidaysJson;
}): Promise<{
  availableYears: number[];
  latestYear: number | null;
  missingYears: number[];
}> {
  const availableYears = extractAvailableYears(json);
  const latestYear = availableYears.length > 0 ? availableYears[availableYears.length - 1] : null;
  const expectedByYear = buildExpectedByYear(json);

  const candidateDates = Array.from(new Set(Array.from(expectedByYear.values()).flatMap((rows) => rows.map((r) => r.date))));

  if (candidateDates.length === 0) {
    return { availableYears, latestYear, missingYears: latestYear ? [latestYear] : [] };
  }

  const { data: existingRows, error: existingDatesError } = await supabase
    .from("holidays")
    .select("holiday_date, observed_date")
    .eq("branch_id", branchId)
    .in("holiday_date", candidateDates);

  if (existingDatesError) throw existingDatesError;

  const existingByDate = new Map<
    string,
    {
      holiday_date: string;
      observed_date: string | null;
    }
  >();
  for (const r of existingRows ?? []) {
    const d = String((r as any)?.holiday_date ?? "").slice(0, 10);
    if (!isIsoDate(d)) continue;
    const o = String((r as any)?.observed_date ?? "").slice(0, 10);
    existingByDate.set(d, { holiday_date: d, observed_date: isIsoDate(o) ? o : null });
  }

  const missingYears: number[] = [];
  for (const y of availableYears) {
    const expected = expectedByYear.get(y) ?? [];
    if (expected.length === 0) continue;

    const complete = expected.every((e) => {
      const existing = existingByDate.get(e.date);
      if (!existing) return false;
      if (e.observed && existing.observed_date !== e.observed) return false;
      return true;
    });

    if (!complete) missingYears.push(y);
  }

  return { availableYears, latestYear, missingYears };
}

async function resolveBranchIdFromRequest(req: NextRequest): Promise<{
  branchId: string | null;
  access: any;
  errorResponse?: Response;
}> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return { branchId: null, access: null, errorResponse: required.response };

  const access = required.access;
  const { searchParams } = new URL(req.url);
  const requestedBranchId = (searchParams.get("branch_id") ?? "").trim() || null;

  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;

  if (!branchId) {
    return { branchId: null, access, errorResponse: NextResponse.json({ error: "branch_id is required" }, { status: 400 }) };
  }
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return { branchId: null, access, errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { branchId, access };
}

export async function GET(req: NextRequest): Promise<Response> {
  const { branchId, errorResponse } = await resolveBranchIdFromRequest(req);
  if (errorResponse) return errorResponse;
  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const requestedYear = parseYear(searchParams.get("year"));
  if (searchParams.has("year") && requestedYear === null) {
    return NextResponse.json({ error: "Invalid year (expected YYYY)" }, { status: 400 });
  }

  let json: UsHolidaysJson;
  try {
    json = await loadUsFederalHolidaysJson();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read holidays JSON";
    return NextResponse.json({ error: `Failed to load holiday source file: ${msg}` }, { status: 500 });
  }

  const supabase = createSupabaseServerClient();
  try {
    const { availableYears, latestYear, missingYears } = await computeMissingYears({ supabase, branchId, json });
    const latestYearMissing = latestYear ? missingYears.includes(latestYear) : false;

    if (requestedYear !== null) {
      const supported = assertYearSupported(requestedYear, availableYears);
      if (!supported.ok) return NextResponse.json({ error: supported.error }, { status: 400 });
    }

    const requestedYearMissing = requestedYear !== null ? missingYears.includes(requestedYear) : null;
    return NextResponse.json({
      ok: true,
      branchId,
      availableYears,
      latestYear,
      missingYears,
      latestYearMissing,
      upToDate: !latestYearMissing,
      importSource: IMPORT_SOURCE,
      requestedYear: requestedYear,
      requestedYearMissing,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to compute import status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  let body: ImportPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const access = required.access;
  const requestedBranchId = body.branch_id ?? null;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;

  if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  if (access?.recipient_type === "Branch" && access.branch_id !== branchId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load JSON from repo-level documents folder.
  let json: UsHolidaysJson;
  try {
    json = await loadUsFederalHolidaysJson();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to read holidays JSON";
    return NextResponse.json({ error: `Failed to load holiday source file: ${msg}` }, { status: 500 });
  }

  const supabase = createSupabaseServerClient();
  let availableYears: number[] = [];
  let latestYear: number | null = null;
  let missingYears: number[] = [];
  try {
    const computed = await computeMissingYears({ supabase, branchId, json });
    availableYears = computed.availableYears;
    latestYear = computed.latestYear;
    missingYears = computed.missingYears;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to compute import status" }, { status: 500 });
  }

  const requestedYear = parseYear(body.year);
  if (body.year !== undefined && requestedYear === null) {
    return NextResponse.json({ error: "Invalid year (expected YYYY)" }, { status: 400 });
  }
  if (requestedYear !== null) {
    const supported = assertYearSupported(requestedYear, availableYears);
    if (!supported.ok) return NextResponse.json({ error: supported.error }, { status: 400 });
  }

  const latestYearMissing = latestYear ? missingYears.includes(latestYear) : false;
  const requestedYearMissing = requestedYear !== null ? missingYears.includes(requestedYear) : null;

  if (requestedYear !== null && requestedYearMissing === false) {
    return NextResponse.json({
      ok: true,
      upToDate: !latestYearMissing,
      latestYear,
      missingYears,
      insertedCount: 0,
      updatedCount: 0,
      importSource: IMPORT_SOURCE,
      requestedYear,
      requestedYearMissing: false,
    });
  }

  // Back-compat behavior: without an explicit year, only import when the latest year is missing.
  if (requestedYear === null && !latestYearMissing) {
    return NextResponse.json({
      ok: true,
      upToDate: true,
      latestYear,
      missingYears,
      insertedCount: 0,
      updatedCount: 0,
      importSource: IMPORT_SOURCE,
      requestedYear: null,
      requestedYearMissing: null,
    });
  }

  const yearsToImport = requestedYear !== null ? [requestedYear] : missingYears;

  const rowsToInsert: Array<{
    branch_id: string;
    holiday_date: string;
    observed_date: string | null;
    name: string;
    notes: string | null;
    is_active: boolean;
    is_closed: boolean;
    closed_start_time: string | null;
    closed_end_time: string | null;
    import_source: string;
  }> = [];

  for (const h of json.holidays ?? []) {
    const name = (h?.name ?? "").trim();
    if (!name) continue;
    const dates = h?.dates ?? {};
    for (const y of yearsToImport) {
      const entry = dates[String(y)];
      if (!entry) continue;
      const date = String(entry.date ?? "").trim();
      const observed = String(entry.observed ?? "").trim();
      const observedDate = observed && isIsoDate(observed) ? observed : null;
      if (!isIsoDate(date)) continue;

      rowsToInsert.push({
        branch_id: branchId,
        holiday_date: date,
        observed_date: observedDate,
        name,
        notes: null,
        is_active: true,
        is_closed: false,
        closed_start_time: null,
        closed_end_time: null,
        import_source: IMPORT_SOURCE,
      });
    }
  }

  // Deduplicate by holiday_date in case the source data repeats.
  const byDate = new Map<string, (typeof rowsToInsert)[number]>();
  for (const r of rowsToInsert) {
    byDate.set(r.holiday_date, r);
  }
  const deduped = Array.from(byDate.values());

  // Avoid overwriting anything: fetch existing dates and only insert missing.
  const candidateDates = deduped.map((r) => r.holiday_date);
  const { data: existingDatesRows, error: existingDatesError } = await supabase
    .from("holidays")
    .select("id, holiday_date, name, observed_date, import_source")
    .eq("branch_id", branchId)
    .in("holiday_date", candidateDates);

  if (existingDatesError) {
    return NextResponse.json({ error: existingDatesError.message }, { status: 500 });
  }

  const existingByDate = new Map<
    string,
    { id: string; holiday_date: string; name: string; observed_date: string | null; import_source: string | null }
  >();
  for (const r of existingDatesRows ?? []) {
    const d = String((r as any)?.holiday_date ?? "").slice(0, 10);
    if (!isIsoDate(d)) continue;
    const id = String((r as any)?.id ?? "").trim();
    if (!id) continue;
    const name = String((r as any)?.name ?? "").trim();
    const o = String((r as any)?.observed_date ?? "").slice(0, 10);
    existingByDate.set(d, {
      id,
      holiday_date: d,
      name,
      observed_date: isIsoDate(o) ? o : null,
      import_source: (r as any)?.import_source ? String((r as any).import_source) : null,
    });
  }

  const finalRows = deduped.filter((r) => !existingByDate.has(r.holiday_date));

  // If rows already exist, but observed_date is missing/outdated, patch them (import rows only).
  let updatedCount = 0;
  for (const r of deduped) {
    const existing = existingByDate.get(r.holiday_date);
    if (!existing) continue;
    if (existing.name !== r.name) continue;
    if (existing.import_source && existing.import_source !== IMPORT_SOURCE) continue;
    if (!r.observed_date) continue;
    if (existing.observed_date === r.observed_date) continue;

    const { error: updateErr } = await supabase
      .from("holidays")
      .update({
        observed_date: r.observed_date,
        import_source: existing.import_source ?? IMPORT_SOURCE,
      })
      .eq("id", existing.id);
    if (!updateErr) updatedCount += 1;
  }

  if (finalRows.length === 0) {
    // No insert needed (all dates already exist). Mark any matching existing rows
    // that do not already have an import_source so the UI can treat it as imported.
    const { error: markError } = await supabase
      .from("holidays")
      .update({ import_source: IMPORT_SOURCE })
      .eq("branch_id", branchId)
      .in("holiday_date", candidateDates)
      .is("import_source", null);

    if (markError) return NextResponse.json({ error: markError.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      upToDate: false,
      latestYear,
      missingYears,
      insertedCount: 0,
      updatedCount,
      importSource: IMPORT_SOURCE,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("holidays")
    .insert(finalRows)
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Also mark any pre-existing matching rows (for the missing years) with the import source.
  // This does not overwrite branch settings; it only sets a null marker.
  await supabase
    .from("holidays")
    .update({ import_source: IMPORT_SOURCE })
    .eq("branch_id", branchId)
    .in("holiday_date", candidateDates)
    .is("import_source", null);

  // Recompute status after import
  try {
    const recomputed = await computeMissingYears({ supabase, branchId, json });
    const nextLatestMissing = recomputed.latestYear ? recomputed.missingYears.includes(recomputed.latestYear) : false;
    const nextRequestedYearMissing = requestedYear !== null ? recomputed.missingYears.includes(requestedYear) : null;
    return NextResponse.json({
      ok: true,
      upToDate: !nextLatestMissing,
      latestYear: recomputed.latestYear,
      missingYears: recomputed.missingYears,
      insertedCount: inserted?.length ?? 0,
      updatedCount,
      importSource: IMPORT_SOURCE,
      requestedYear,
      requestedYearMissing: nextRequestedYearMissing,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      upToDate: false,
      latestYear,
      missingYears,
      insertedCount: inserted?.length ?? 0,
      updatedCount,
      importSource: IMPORT_SOURCE,
      requestedYear,
      requestedYearMissing,
    });
  }
}

