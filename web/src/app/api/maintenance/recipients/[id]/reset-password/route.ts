import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email-sender";
import { buildPasswordResetEmail } from "@/lib/email-templates";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateTempPassword(password: string): string | null {
  const trimmed = password.trim();
  if (trimmed.length < 8) return "Temporary password must be at least 8 characters";
  if (!/[a-z]/i.test(trimmed) || !/\d/.test(trimmed)) {
    return "Temporary password must include at least one letter and one number";
  }
  return null;
}

type RouteParams = {
  params: Promise<{ id: string }>;
};

async function sendPasswordResetEmail(params: {
  req: Request;
  to: string;
  firstName: string | null;
  tempPassword: string;
}): Promise<boolean> {
  const origin = new URL(params.req.url).origin;
  const appUrl = origin;

  const email = buildPasswordResetEmail({
    firstName: params.firstName,
    toEmail: params.to,
    tempPassword: params.tempPassword,
    appUrl,
  });

  const result = await sendEmail({
    to: [params.to],
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return result.ok;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Normal") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid recipient id format" }, { status: 400 });
  }

  let body: { temp_password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tempPassword = body.temp_password;
  if (!tempPassword) {
    return NextResponse.json({ error: "temp_password is required" }, { status: 400 });
  }

  const pwError = validateTempPassword(tempPassword);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { data: recipient, error: loadError } = await supabase
    .from("branch_schedule_recipients")
    .select("id, email, first_name, auth_user_id, is_active")
    .eq("id", id)
    .single();

  if (loadError || !recipient) {
    return NextResponse.json({ error: loadError?.message || "Recipient not found" }, { status: 404 });
  }

  if (!recipient.auth_user_id) {
    return NextResponse.json({ error: "Recipient does not have an auth user linked" }, { status: 400 });
  }

  // Update Auth password (service role)
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(recipient.auth_user_id, {
    password: tempPassword.trim(),
  });

  if (authError) {
    return await serverErrorResponse({
      req,
      errorType: "AUTH_ERROR",
      publicMessage: authError.message,
      logMessage: authError.message,
      context: { module: "api.maintenance.recipients.reset_password", action: "update_auth_password" },
      err: authError,
    });
  }

  // Mark password setup required
  const { error: updateError } = await supabase
    .from("branch_schedule_recipients")
    .update({ needs_password_setup: true })
    .eq("id", id);

  if (updateError) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: updateError.message,
      logMessage: updateError.message,
      context: { module: "api.maintenance.recipients.reset_password", action: "update_recipient" },
      err: updateError,
    });
  }

  let emailSent = false;
  try {
    emailSent = await sendPasswordResetEmail({
      req,
      to: recipient.email,
      firstName: recipient.first_name,
      tempPassword: tempPassword.trim(),
    });
  } catch {
    emailSent = false;
  }

  return NextResponse.json({ success: true, password_reset_email_sent: emailSent });
}

