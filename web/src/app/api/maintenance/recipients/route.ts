import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email-sender";
import { buildWelcomeEmail, type OrgAssignment } from "@/lib/email-templates";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { randomBytes } from "crypto";

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
  recipient_type: "Administrator" | "Branch" | "Member" | "Normal";
  receives_reports?: boolean;
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
  recipient_type?: "Administrator" | "Branch" | "Member" | "Normal";
  receives_reports?: boolean;
  /**
   * If true, create a linked Supabase Auth user and send onboarding email instructions.
   * This uses email OTP for first-time login (no temporary passwords).
   */
  create_auth_user?: boolean;
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
  recipient_type?: "Administrator" | "Branch" | "Member" | "Normal";
  receives_reports?: boolean;
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

function generateRandomPassword(): string {
  // This password is never revealed to the user; it only satisfies Supabase Auth requirements.
  return randomBytes(24).toString("base64url");
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  // Supabase admin API doesn't provide a direct "get by email", so we page through users.
  // This endpoint is used in admin-only flows, so a bounded scan is acceptable.
  const target = email.trim().toLowerCase();
  if (!target) return null;

  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").trim().toLowerCase() === target);
    if (match?.id) return match.id;
    if (users.length < perPage) break; // last page
  }
  return null;
}

function isAuthUserAlreadyRegisteredError(err: unknown): boolean {
  const message = typeof (err as any)?.message === "string" ? String((err as any).message) : "";
  // Common Supabase message: "A user with this email address has already been registered"
  return message.toLowerCase().includes("already been registered") || message.toLowerCase().includes("already registered");
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
    required.access?.recipient_type === "Branch" ? required.access.branch_id : branchId;

  if (!effectiveBranchId && !("devPassthrough" in required)) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  if (effectiveBranchId && !UUID_REGEX.test(effectiveBranchId)) {
    return NextResponse.json({ error: "Invalid branch_id format" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const isBranchUser = required.access?.recipient_type === "Branch";
  const selectColumns = isBranchUser
    ? "id, branch_id, email, first_name, last_name, on_hold, recipient_type, receives_reports, created_at"
    : "id, branch_id, email, first_name, last_name, phone, address, city, state, zip_code, on_hold, recipient_type, receives_reports, created_at, auth_user_id, is_active, needs_password_setup, last_login_at";

  let query = supabase
    .from("branch_schedule_recipients")
    .select(selectColumns)
    .order("on_hold", { ascending: true })
    .order("email", { ascending: true });

  // Branch users can list recipients for their own branch (used by report Email To/CC/BCC pickers).
  // Admins can list recipients for any selected branch.
  if (effectiveBranchId) {
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
  if (required.access?.recipient_type === "Branch") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  let body: CreateRecipientPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    branch_id,
    email,
    first_name,
    last_name,
    phone,
    address,
    city,
    state,
    zip_code,
    recipient_type,
    receives_reports,
    create_auth_user,
  } = body;

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

  const normalizedType =
    recipient_type === "Normal"
      ? "Branch"
      : recipient_type ?? "Branch";
  if (
    normalizedType !== "Administrator" &&
    normalizedType !== "Branch" &&
    normalizedType !== "Member"
  ) {
    return NextResponse.json({ error: "Invalid recipient_type" }, { status: 400 });
  }

  const shouldCreateAuthUser =
    normalizedType === "Member" ? false : create_auth_user === true;

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
  if (shouldCreateAuthUser) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: generateRandomPassword(),
      email_confirm: true,
    });

    if (createError || !created?.user) {
      // If the auth user already exists (e.g., recipient was deleted but auth user remained),
      // re-link to the existing auth user so onboarding via OTP can still proceed.
      if (createError && isAuthUserAlreadyRegisteredError(createError)) {
        try {
          const existingAuthUserId = await findAuthUserIdByEmail(normalizedEmail);
          if (existingAuthUserId) {
            authUserId = existingAuthUserId;
          } else {
            return await serverErrorResponse({
              req,
              errorType: "AUTH_ERROR",
              publicMessage: "User already exists in authentication but could not be located for relinking",
              logMessage: createError.message,
              context: { module: "api.maintenance.recipients", action: "relink_existing_auth_user" },
              err: createError,
            });
          }
        } catch (listErr) {
          return await serverErrorResponse({
            req,
            errorType: "AUTH_ERROR",
            publicMessage: "User already exists in authentication but could not be listed for relinking",
            logMessage: createError.message,
            context: { module: "api.maintenance.recipients", action: "relink_existing_auth_user_list_failed" },
            err: listErr,
          });
        }
      } else {
        return await serverErrorResponse({
          req,
          errorType: "AUTH_ERROR",
          publicMessage: createError?.message || "Failed to create user account",
          logMessage: createError?.message || "Failed to create user account",
          context: { module: "api.maintenance.recipients", action: "create_auth_user" },
          err: createError ?? null,
        });
      }
    } else {
      authUserId = created.user.id;
    }
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
      recipient_type: normalizedType,
      receives_reports:
        normalizedType === "Member" ? !!receives_reports : false,
      auth_user_id: authUserId,
      is_active: true,
      needs_password_setup: shouldCreateAuthUser ? true : false,
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
  if (shouldCreateAuthUser) {
    const org = await loadOrgInfoForBranch(supabase, branch_id);
    try {
      welcomeEmailSent = await sendWelcomeEmail({
        req,
        to: normalizedEmail,
        firstName: first_name?.trim() || null,
        org,
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
  if (required.access?.recipient_type === "Branch") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();

  let body: UpdateRecipientPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    id,
    email,
    first_name,
    last_name,
    phone,
    address,
    city,
    state,
    zip_code,
    on_hold,
    recipient_type,
    receives_reports,
  } = body;

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
  const nextType =
    recipient_type === "Normal" ? "Branch" : recipient_type;
  if (nextType !== undefined) {
    if (nextType !== "Administrator" && nextType !== "Branch" && nextType !== "Member") {
      return NextResponse.json({ error: "Invalid recipient_type" }, { status: 400 });
    }
    updates.recipient_type = nextType;
    // Members are email-only; keep their report opt-in. Non-members are always false.
    updates.receives_reports = nextType === "Member" ? !!receives_reports : false;
    // If switching to Member, ensure it never appears as pending password setup.
    if (nextType === "Member") {
      updates.needs_password_setup = false;
    }
  } else if (receives_reports !== undefined) {
    // Allow toggling report opt-in without changing type (Member recipients only).
    updates.receives_reports = !!receives_reports;
  }

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
  if (required.access?.recipient_type === "Branch") {
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
  if (required.access?.recipient_type === "Branch") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Load recipient first so we can also delete the linked Auth user (if any).
  const { data: recipient, error: loadError } = await supabase
    .from("branch_schedule_recipients")
    .select("id, email, auth_user_id")
    .eq("id", id)
    .single();

  if (loadError || !recipient) {
    return NextResponse.json({ error: loadError?.message || "Recipient not found" }, { status: 404 });
  }

  // If this recipient is linked to an auth user, delete the auth user too.
  // This matches admin expectations: deleting the recipient removes their ability to sign in.
  let authUserDeleted = false;
  const authUserId = (recipient as any).auth_user_id as string | null | undefined;
  if (authUserId) {
    // Safety: do not delete if some other recipient still references this auth user.
    const { data: others, error: otherErr } = await supabase
      .from("branch_schedule_recipients")
      .select("id")
      .eq("auth_user_id", authUserId)
      .neq("id", id);

    if (otherErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: otherErr.message,
        logMessage: otherErr.message,
        context: { module: "api.maintenance.recipients", action: "delete_check_other_references" },
        err: otherErr,
      });
    }

    if (!others || others.length === 0) {
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (authErr) {
        // If Auth deletion fails, still allow the admin to remove the recipient record,
        // but return a server error so they know the email will remain taken in Auth.
        return await serverErrorResponse({
          req,
          errorType: "AUTH_ERROR",
          publicMessage: authErr.message,
          logMessage: authErr.message,
          context: { module: "api.maintenance.recipients", action: "delete_auth_user" },
          err: authErr,
        });
      }
      authUserDeleted = true;
    }
  }

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

  return NextResponse.json({ success: true, auth_user_deleted: authUserDeleted });
}
