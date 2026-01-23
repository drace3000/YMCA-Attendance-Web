import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type Params = { params: Promise<{ id: string }> };

interface AllianceData {
  id: string;
  name: string;
  code: string;
}

interface AssociationData {
  id: string;
  name: string;
  code: string;
  alliance?: AllianceData | AllianceData[] | null;
}

interface BranchData {
  id: string;
  code: string;
  short_code: string | null;
  name: string;
  branch_manager_name?: string | null;
  branch_manager_email?: string | null;
  branch_manager_phone?: string | null;
  availability_time_start?: string | null; // Postgres time string
  availability_time_end?: string | null; // Postgres time string
  association?: AssociationData | AssociationData[] | null;
}

function normalizeTimeToHm(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  // Accept HH:mm or HH:mm:ss
  const m = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseHmToMinutes(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

// GET - fetch branch with association/alliance names
export async function GET(req: Request, context: Params): Promise<NextResponse> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response as NextResponse;

  const { id } = await context.params;

  // Server-side enforcement: Branch users may only access their assigned branch.
  const access = required.access;
  if (access && access.recipient_type === "Branch" && access.branch_id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  // NOTE: Some environments may not have the availability_time_* columns yet.
  // To avoid breaking hierarchy display (Alliance/Association), we retry without those columns
  // if Postgres reports them missing.
  const selectWithAvailability = `
        id,
        code,
        short_code,
        name,
        branch_manager_name,
        branch_manager_email,
        branch_manager_phone,
        availability_time_start,
        availability_time_end,
        association:association_id (
          id,
          name,
          code,
          alliance:alliance_id (
            id,
            name,
            code
          )
        )
      `;

  const selectWithoutAvailability = `
        id,
        code,
        short_code,
        name,
        branch_manager_name,
        branch_manager_email,
        branch_manager_phone,
        association:association_id (
          id,
          name,
          code,
          alliance:alliance_id (
            id,
            name,
            code
          )
        )
      `;

  let data: unknown = null;
  let error: { message?: string } | null = null;

  {
    const res = await supabase.from("ymca_branches").select(selectWithAvailability).eq("id", id).single();
    data = res.data;
    error = res.error ? { message: res.error.message } : null;
  }

  if (error?.message?.includes("availability_time_start") && error.message.includes("does not exist")) {
    const res = await supabase.from("ymca_branches").select(selectWithoutAvailability).eq("id", id).single();
    data = res.data;
    error = res.error ? { message: res.error.message } : null;
  }

  if (error) {
    return NextResponse.json({ error: "Failed to fetch branch" }, { status: 500 });
  }

  const typedData = data as BranchData | null;
  const branchName = typedData?.name ?? null;
  const branchCode = typedData?.code ?? null;
  const branchShortCode = typedData?.short_code ?? null;
  const branchManagerName = typedData?.branch_manager_name ?? null;
  const branchManagerEmail = typedData?.branch_manager_email ?? null;
  const branchManagerPhone = typedData?.branch_manager_phone ?? null;
  const availabilityTimeStart = normalizeTimeToHm(typedData?.availability_time_start ?? null);
  const availabilityTimeEnd = normalizeTimeToHm(typedData?.availability_time_end ?? null);
  
  // Handle association which could be object or array from Supabase
  const association = Array.isArray(typedData?.association) 
    ? typedData?.association[0] 
    : typedData?.association;
  
  const associationName = association?.name ?? null;
  const associationCode = association?.code ?? null;
  
  // Handle alliance which could be object or array from Supabase
  const alliance = Array.isArray(association?.alliance) 
    ? association?.alliance[0] 
    : association?.alliance;
  
  const allianceName = alliance?.name ?? null;
  const allianceCode = alliance?.code ?? null;

  return NextResponse.json({
    id,
    name: branchName,
    code: branchCode,
    short_code: branchShortCode,
    // Back-compat + convenience: provide nested association/alliance
    // (Some UI code expects json.association.name and json.association.alliance.name)
    association: associationName || associationCode || allianceName || allianceCode
      ? {
          id: association?.id ?? null,
          name: associationName,
          code: associationCode,
          alliance: allianceName || allianceCode
            ? {
                id: alliance?.id ?? null,
                name: allianceName,
                code: allianceCode,
              }
            : null,
        }
      : null,
    association_name: associationName,
    association_code: associationCode,
    alliance_name: allianceName,
    alliance_code: allianceCode,
    branch_manager_name: branchManagerName,
    branch_manager_email: branchManagerEmail,
    branch_manager_phone: branchManagerPhone,
    availability_time_start: availabilityTimeStart,
    availability_time_end: availabilityTimeEnd,
  });
}

// PATCH - Update branch fields
export async function PATCH(req: Request, context: Params): Promise<NextResponse> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response as NextResponse;

  const { id } = await context.params;

  // Server-side enforcement: Branch users may only update their assigned branch.
  const access = required.access;
  if (access && access.recipient_type === "Branch" && access.branch_id !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Only allow updating specific fields
  const allowedFields = [
    "branch_manager_name",
    "branch_manager_email", 
    "branch_manager_phone",
    "website_url",
    "schedule_email_from",
    "schedule_email_reply_to",
    "theme_color",
    "availability_time_start",
    "availability_time_end",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  // Validate availability time range updates (require both values if either is present).
  const wantsTimeRange =
    Object.prototype.hasOwnProperty.call(body, "availability_time_start") ||
    Object.prototype.hasOwnProperty.call(body, "availability_time_end");

  if (wantsTimeRange) {
    if (
      !Object.prototype.hasOwnProperty.call(body, "availability_time_start") ||
      !Object.prototype.hasOwnProperty.call(body, "availability_time_end")
    ) {
      return NextResponse.json(
        { error: "Both availability_time_start and availability_time_end are required." },
        { status: 400 },
      );
    }

    const startHm = normalizeTimeToHm(body.availability_time_start);
    const endHm = normalizeTimeToHm(body.availability_time_end);
    if (!startHm || !endHm) {
      return NextResponse.json(
        { error: "availability_time_start and availability_time_end must be valid times (HH:mm)." },
        { status: 400 },
      );
    }
    const startMin = parseHmToMinutes(startHm);
    const endMin = parseHmToMinutes(endHm);
    if (startMin === null || endMin === null || endMin <= startMin) {
      return NextResponse.json(
        { error: "availability_time_end must be greater than availability_time_start." },
        { status: 400 },
      );
    }

    // Store normalized values (HH:mm).
    updates.availability_time_start = startHm;
    updates.availability_time_end = endHm;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("ymca_branches")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Error updating branch:", error.message);
    return NextResponse.json({ error: "Failed to update branch" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
