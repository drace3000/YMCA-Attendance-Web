import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email-sender";
import { buildWelcomeEmail, type OrgAssignment } from "@/lib/email-templates";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type RecipientRow = {
  id: string;
  branch_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  on_hold: boolean;
  recipient_type: "Administrator" | "Normal";
  created_at: string;
  auth_user_id?: string | null;
  is_active?: boolean;
  needs_password_setup?: boolean;
  last_login_at?: string | null;
};

type CreateRecipientPayload = {
  branch_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  recipient_type?: "Administrator" | "Normal";
  /**
   * Optional: if provided, this recipient becomes a user account.
   * Phase 3 supports creating branch manager users with a temporary password.
   */
  temp_password?: string;
};

type UpdateRecipientPayload = {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  on_hold?: boolean;
  recipient_type?: "Administrator" | "Normal";
};

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\(\d{3}\)\s\d{3}-\d{4}(?:\s?ext\s?\d{1,5})?$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

function validatePhone(phone: string): boolean {
  return phone === "" || PHONE_REGEX.test(phone.trim());
}

function validateZip(zip: string): boolean {
  return zip === "" || ZIP_REGEX.test(zip.trim());
}

function validateTempPassword(password: string): string | null {
  const trimmed = password.trim();
  if (trimmed.length < 8) return "Temporary password must be at least 8 characters";
  if (!/[a-z]/i.test(trimmed) || !/\d/.test(trimmed)) {
    return "Temporary password must include at least one letter and one number";
  }
  return null;
}

type OrgBranchInfo = {
  branchName: string;
  associationName: string | null;
  allianceName: string | null;
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function loadOrgInfoForBranch(supabase: ReturnType<typeof createSupabaseServerClient>, branchId: string): Promise<OrgBranchInfo | null> {
  const { data, error } = await supabase
    .from("ymca_branches")
    .select(
      `
      id,
      name,
      association:ymca_associations(
        id,
        name,
        alliance:ymca_alliances(id, name)
      )
    `
    )
    .eq("id", branchId)
    .single();

  if (error || !data) return null;

  const assoc = normalizeRelation<{ id: string; name: string; alliance?: unknown }>(data.association);
  const alliance = normalizeRelation<{ id: string; name: string }>(assoc?.alliance as any);

  return {
    branchName: data.name,
    associationName: assoc?.name ?? null,
    allianceName: alliance?.name ?? null,
  };
}

async function sendWelcomeEmail(params: {
  req: Request;
  to: string;
  firstName: string | null;
  org: OrgBranchInfo | null;
  tempPassword: string;
}): Promise<boolean> {
  const origin = new URL(params.req.url).origin;
  const appUrl = origin;

  const assignment: OrgAssignment = {
    allianceName: params.org?.allianceName ?? null,
    associationName: params.org?.associationName ?? null,
    branchName: params.org?.branchName ?? null,
  };

  const email = buildWelcomeEmail({
    firstName: params.firstName,
    toEmail: params.to,
    assignment,
    tempPassword: params.tempPassword,
    appUrl,
  });

  const result = await sendEmail({
    to: [params.to],
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  // Do not block user creation on email failures.
  return result.ok;
}

// GET - List recipients for a branch
export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(req.url);
  const branchId = searchParams.get("branch_id");

  const effectiveBranchId =
    required.access?.recipient_type === "Normal" ? required.access.branch_id : branchId;

  if (!effectiveBranchId && !("devPassthrough" in required)) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  if (effectiveBranchId && !UUID_REGEX.test(effectiveBranchId)) {
    return NextResponse.json({ error: "Invalid branch_id format" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  let query = supabase
    .from("branch_schedule_recipients")
    .select(
      "id, branch_id, email, first_name, last_name, phone, address, city, state, zip_code, on_hold, recipient_type, created_at, auth_user_id, is_active, needs_password_setup, last_login_at",
    )
    .order("on_hold", { ascending: true })
    .order("email", { ascending: true });

  // Normal users can only read their own record.
  if (required.access?.recipient_type === "Normal") {
    query = query.eq("email", required.access.email);
  } else if (effectiveBranchId) {
    query = query.eq("branch_id", effectiveBranchId);
  }

  const { data, error } = await query;

  if (error) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: error.message,
      logMessage: error.message,
      context: { module: "api.maintenance.recipients", action: "list" },
      err: error,
    });
  }

  return NextResponse.json(data ?? []);
}

// POST - Create a new recipient
export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Normal") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  let body: CreateRecipientPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { branch_id, email, first_name, last_name, phone, address, city, state, zip_code, recipient_type, temp_password } = body;

  if (!branch_id) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  if (!UUID_REGEX.test(branch_id)) {
    return NextResponse.json({ error: "Invalid branch_id format" }, { status: 400 });
  }

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Validate email format
  if (!validateEmail(email)) {
    return NextResponse.json({ error: "Invalid email format (e.g., name@example.com)" }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(email);

  // If temp_password is provided, validate it (this is the branch-manager user creation flow).
  if (temp_password !== undefined) {
    const pwError = validateTempPassword(temp_password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }
  }

  // Validate phone format if provided
  if (phone && !validatePhone(phone)) {
    return NextResponse.json({ error: "Invalid phone format. Use (1234) 567-8901 or (1234) 567-8901 ext 12345" }, { status: 400 });
  }

  // Validate zip code format if provided
  if (zip_code && !validateZip(zip_code)) {
    return NextResponse.json({ error: "Invalid ZIP code format. Use 12345 or 12345-6789" }, { status: 400 });
  }

  // Check for duplicate email globally (case-insensitive).
  const { data: existing } = await supabase
    .from("branch_schedule_recipients")
    .select("id")
    .ilike("email", normalizedEmail);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "This email is already added" },
      { status: 409 }
    );
  }

  let authUserId: string | null = null;
  if (temp_password !== undefined) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: temp_password.trim(),
      email_confirm: true,
    });

    if (createError || !created?.user) {
      return await serverErrorResponse({
        req,
        errorType: "AUTH_ERROR",
        publicMessage: createError?.message || "Failed to create user account",
        logMessage: createError?.message || "Failed to create user account",
        context: { module: "api.maintenance.recipients", action: "create_auth_user" },
        err: createError ?? null,
      });
    }

    authUserId = created.user.id;
  }

  const { data, error } = await supabase
    .from("branch_schedule_recipients")
    .insert({
      branch_id,
      email: normalizedEmail,
      first_name: first_name?.trim() || null,
      last_name: last_name?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      city: city?.trim() || null,
      state: state?.trim().toUpperCase() || null,
      zip_code: zip_code?.trim() || null,
      recipient_type: recipient_type || "Normal",
      auth_user_id: authUserId,
      is_active: true,
      needs_password_setup: true,
    })
    .select()
    .single();

  if (error) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: error.message,
      logMessage: error.message,
      context: { module: "api.maintenance.recipients", action: "create" },
      err: error,
    });
  }

  let welcomeEmailSent = false;
  if (temp_password !== undefined) {
    const org = await loadOrgInfoForBranch(supabase, branch_id);
    try {
      welcomeEmailSent = await sendWelcomeEmail({
        req,
        to: normalizedEmail,
        firstName: first_name?.trim() || null,
        org,
        tempPassword: temp_password.trim(),
      });
    } catch {
      // Never block user creation on email failures.
      welcomeEmailSent = false;
    }
  }

  return NextResponse.json(
    {
      ...data,
      welcome_email_sent: welcomeEmailSent,
    },
    { status: 201 }
  );
}

// PUT - Update an existing recipient (modify contact details or on_hold)
export async function PUT(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Normal") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  let body: UpdateRecipientPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, email, first_name, last_name, phone, address, city, state, zip_code, on_hold, recipient_type } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Load existing recipient to get branch for duplicate checks
  const { data: existingRow, error: fetchError } = await supabase
    .from("branch_schedule_recipients")
    .select("id, branch_id, email")
    .eq("id", id)
    .single();

  if (fetchError || !existingRow) {
    return NextResponse.json({ error: fetchError?.message || "Recipient not found" }, { status: 404 });
  }

  const updates: Partial<RecipientRow> = {};

  if (email !== undefined) {
    if (!email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Invalid email format (e.g., name@example.com)" }, { status: 400 });
    }
    updates.email = email.trim().toLowerCase();

    // Check duplicates globally (case-insensitive), excluding current id
    const { data: dupCheck } = await supabase
      .from("branch_schedule_recipients")
      .select("id")
      .ilike("email", normalizeEmail(email))
      .neq("id", id);

    if (dupCheck && dupCheck.length > 0) {
      return NextResponse.json(
        { error: "This email is already added" },
        { status: 409 }
      );
    }
  }

  if (phone !== undefined) {
    if (phone && !validatePhone(phone)) {
      return NextResponse.json({ error: "Invalid phone format. Use (123) 456-7890 or (123) 456-7890 ext 12345" }, { status: 400 });
      return NextResponse.json({ error: "Invalid phone format. Use (123) 456-7890 or (123) 456-7890 ext 12345" }, { status: 400 });
    }
    updates.phone = phone?.trim() || null;
  }

  if (zip_code !== undefined) {
    if (zip_code && !validateZip(zip_code)) {
      return NextResponse.json({ error: "Invalid ZIP code format. Use 12345 or 12345-6789" }, { status: 400 });
    }
    updates.zip_code = zip_code?.trim() || null;
  }

  if (first_name !== undefined) updates.first_name = first_name?.trim() || null;
  if (last_name !== undefined) updates.last_name = last_name?.trim() || null;
  if (address !== undefined) updates.address = address?.trim() || null;
  if (city !== undefined) updates.city = city?.trim() || null;
  if (state !== undefined) updates.state = state?.trim().toUpperCase() || null;
  if (on_hold !== undefined) updates.on_hold = !!on_hold;
  if (recipient_type !== undefined) updates.recipient_type = recipient_type;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("branch_schedule_recipients")
    .update(updates)
    .eq("id", id);

  if (error) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: error.message,
      logMessage: error.message,
      context: { module: "api.maintenance.recipients", action: "update" },
      err: error,
    });
  }

  return NextResponse.json({ success: true });
}

// PATCH - Toggle on_hold only
export async function PATCH(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Normal") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  let body: { id?: string; on_hold?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, on_hold } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  if (on_hold === undefined) {
    return NextResponse.json({ error: "on_hold is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("branch_schedule_recipients")
    .update({ on_hold: !!on_hold })
    .eq("id", id);

  if (error) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: error.message,
      logMessage: error.message,
      context: { module: "api.maintenance.recipients", action: "toggle_on_hold" },
      err: error,
    });
  }

  return NextResponse.json({ success: true });
}

// DELETE - Remove a recipient
export async function DELETE(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Normal") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("branch_schedule_recipients")
    .delete()
    .eq("id", id);

  if (error) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: error.message,
      logMessage: error.message,
      context: { module: "api.maintenance.recipients", action: "delete" },
      err: error,
    });
  }

  return NextResponse.json({ success: true });
}
