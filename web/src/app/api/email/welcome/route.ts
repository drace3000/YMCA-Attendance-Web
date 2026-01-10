import { NextResponse, type NextRequest } from "next/server";
import { serverErrorResponse } from "@/lib/server-api-error";
import { sendEmail } from "@/lib/email-sender";
import { buildPasswordResetEmail, buildWelcomeEmail, type OrgAssignment } from "@/lib/email-templates";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WelcomeEmailRequest =
  | {
      type: "welcome";
      to: string;
      first_name?: string | null;
      assignment?: OrgAssignment;
      temp_password: string;
    }
  | {
      type: "password_reset";
      to: string;
      first_name?: string | null;
      temp_password: string;
    };

export async function POST(req: NextRequest): Promise<Response> {
  let body: WelcomeEmailRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.to || !EMAIL_REGEX.test(body.to.trim())) {
    return NextResponse.json({ error: "Valid to email is required" }, { status: 400 });
  }

  if (!body.temp_password?.trim()) {
    return NextResponse.json({ error: "temp_password is required" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const appUrl = origin;

  const normalizedTo = body.to.trim().toLowerCase();
  const firstName = body.first_name?.trim() || null;

  const email =
    body.type === "welcome"
      ? buildWelcomeEmail({
          firstName,
          toEmail: normalizedTo,
          assignment: body.assignment ?? { allianceName: null, associationName: null, branchName: null },
          tempPassword: body.temp_password.trim(),
          appUrl,
        })
      : buildPasswordResetEmail({
          firstName,
          toEmail: normalizedTo,
          tempPassword: body.temp_password.trim(),
          appUrl,
        });

  const result = await sendEmail({
    to: [normalizedTo],
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (!result.ok) {
    // For this explicit endpoint, return a server error when not configured or failed.
    return await serverErrorResponse({
      req,
      errorType: "EMAIL_ERROR",
      status: result.reason === "not_configured" ? 500 : 502,
      publicMessage:
        result.reason === "not_configured"
          ? "Email service not configured. Missing RESEND_API_KEY."
          : "Failed to send email",
      logMessage: result.message ?? result.reason,
      context: { module: "api.email.welcome", action: body.type },
      err: result.message ?? null,
    });
  }

  return NextResponse.json({ success: true, messageId: result.messageId });
}

