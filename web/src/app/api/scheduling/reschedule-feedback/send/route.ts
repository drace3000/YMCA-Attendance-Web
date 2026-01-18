import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { serverErrorResponse } from "@/lib/server-api-error";
import { sendEmail } from "@/lib/email-sender";
import { buildRescheduleFeedbackRequestEmail } from "@/lib/reschedule-feedback-email-templates";

type SendPayload = {
  schedule_id: string;
  instructor_id: string;
  request_payload: unknown; // snapshot of current/proposed rows for the instructor page
  to_email?: string; // optional override (alternate instructor email)
  additional_emails?: string[]; // optional additional instructor email addresses
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return !!v && EMAIL_REGEX.test(v);
}

function getOrigin(req: NextRequest): string {
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
    if (!required.ok) return required.response;

    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get("branch_id");

    let body: SendPayload;
    try {
      body = (await req.json()) as SendPayload;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const scheduleId = String(body.schedule_id ?? "").trim();
    const instructorId = String(body.instructor_id ?? "").trim();
    if (!scheduleId || !instructorId) {
      return NextResponse.json({ error: "schedule_id and instructor_id are required" }, { status: 400 });
    }

    const access = required.access;
    const isBranchUser = access?.recipient_type === "Branch";
    const branchId = isBranchUser && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
    if (!branchId) {
      return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // Load schedule + branch for context
    const [{ data: scheduleRow, error: scheduleErr }, { data: branchRow, error: branchErr }] =
      await Promise.all([
        supabase
          .from("schedules")
          .select("id, name, month_start, branch_id")
          .eq("id", scheduleId)
          .eq("branch_id", branchId)
          .maybeSingle<{ id: string; name: string; month_start: string; branch_id: string }>(),
        supabase
          .from("ymca_branches")
          .select("id, name, schedule_email_from, branch_manager_email")
          .eq("id", branchId)
          .maybeSingle<{ id: string; name: string; schedule_email_from: string | null; branch_manager_email: string | null }>(),
      ]);

    if (scheduleErr || !scheduleRow) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: scheduleErr?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Failed to load schedule",
        logMessage: scheduleErr?.message ?? "Schedule not found",
        context: { module: "api.scheduling.reschedule_feedback.send", action: "select_schedule", scheduleId, branchId },
        err: scheduleErr ?? null,
      });
    }
    if (branchErr || !branchRow) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: branchErr?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Failed to load branch",
        logMessage: branchErr?.message ?? "Branch not found",
        context: { module: "api.scheduling.reschedule_feedback.send", action: "select_branch", scheduleId, branchId },
        err: branchErr ?? null,
      });
    }

    // Resolve instructor email: instructors.auth_user_id -> branch_schedule_recipients.email
    const { data: instRow, error: instErr } = await supabase
      .from("instructors")
      .select("id, nickname, first_name, last_name, auth_user_id")
      .eq("id", instructorId)
      .maybeSingle<{ id: string; nickname: string | null; first_name: string | null; last_name: string | null; auth_user_id: string | null }>();

    if (instErr || !instRow) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: instErr?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Failed to load instructor",
        logMessage: instErr?.message ?? "Instructor not found",
        context: { module: "api.scheduling.reschedule_feedback.send", action: "select_instructor", instructorId, branchId },
        err: instErr ?? null,
      });
    }

    // Determine the primary instructor email (or testing fallback).
    let primaryEmail: string | null = null;
    if (instRow.auth_user_id) {
      const { data: recRow } = await supabase
        .from("branch_schedule_recipients")
        .select("email, is_active")
        .eq("auth_user_id", instRow.auth_user_id)
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .maybeSingle<{ email: string | null; is_active: boolean }>();
      if (isValidEmail(recRow?.email)) primaryEmail = recRow!.email.trim().toLowerCase();
    }

    // Testing fallback (as requested)
    if (!primaryEmail) primaryEmail = "don.race@outlook.com";

    // Additional emails: support legacy to_email as a single additional email, and additional_emails as a list.
    const additional: string[] = [];
    const legacyExtraRaw = typeof body.to_email === "string" ? body.to_email.trim() : "";
    if (legacyExtraRaw) additional.push(legacyExtraRaw);
    if (Array.isArray(body.additional_emails)) {
      additional.push(...body.additional_emails);
    }
    const additionalClean = Array.from(
      new Set(
        additional
          .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
          .filter(Boolean),
      ),
    );
    const invalidAdditional = additionalClean.filter((e) => !isValidEmail(e));
    if (invalidAdditional.length > 0) {
      return NextResponse.json({ error: `Invalid additional email(s): ${invalidAdditional.join(", ")}` }, { status: 400 });
    }

    const toList = Array.from(new Set([primaryEmail, ...additionalClean]));
    const toEmailForLog = toList.join(", ");

    const instructorLabel =
      (instRow.nickname || `${instRow.first_name ?? ""} ${instRow.last_name ?? ""}`.trim()).trim() || "Instructor";

    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const { data: reqRow, error: reqErr } = await supabase
      .from("schedule_reschedule_requests")
      .insert({
        branch_id: branchId,
        schedule_id: scheduleId,
        instructor_id: instructorId,
        request_token: token,
        request_payload: body.request_payload ?? {},
        expires_at: expiresAt.toISOString(),
      })
      .select("id, created_at, expires_at")
      .single<{ id: string; created_at: string; expires_at: string }>();

    if (reqErr || !reqRow) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to create reschedule feedback request",
        logMessage: reqErr?.message ?? "Insert schedule_reschedule_requests failed",
        context: { module: "api.scheduling.reschedule_feedback.send", action: "insert_request", branchId, scheduleId, instructorId },
        err: reqErr ?? null,
      });
    }

    const baseUrl = getOrigin(req);
    const feedbackUrl = `${baseUrl}/scheduling/reschedule-feedback?t=${encodeURIComponent(token)}`;

    const scheduleLabel = scheduleRow.name || "Schedule";
    const email = buildRescheduleFeedbackRequestEmail({
      branchName: branchRow.name,
      scheduleLabel,
      instructorLabel,
      feedbackUrl,
      expiresAtIso: reqRow.expires_at,
    });

    const fromEmail = isValidEmail(branchRow.schedule_email_from) ? branchRow.schedule_email_from.trim().toLowerCase() : undefined;
    const sendRes = await sendEmail({
      fromName: `${branchRow.name} Scheduler`,
      fromEmail,
      to: toList,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });

    if (!sendRes.ok) {
      return await serverErrorResponse({
        req,
        errorType: "EMAIL_ERROR",
        status: sendRes.reason === "not_configured" ? 500 : 502,
        publicMessage:
          sendRes.reason === "not_configured"
            ? "Email service not configured. Missing RESEND_API_KEY."
            : "Failed to send reschedule feedback email",
        logMessage: sendRes.message ?? sendRes.reason,
        context: { module: "api.scheduling.reschedule_feedback.send", action: "send_email", branchId, scheduleId, instructorId, toEmail: toEmailForLog },
        err: sendRes.message ?? null,
      });
    }

    const { error: logErr } = await supabase.from("schedule_reschedule_email_log").insert({
      branch_id: branchId,
      schedule_id: scheduleId,
      instructor_id: instructorId,
      sent_at: now.toISOString(),
      from_email: fromEmail ?? "onboarding@resend.dev",
      to_email: toEmailForLog,
      subject: email.subject,
      message_id: sendRes.messageId ?? null,
    });

    if (logErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Email sent, but failed to record send log",
        logMessage: logErr.message,
        context: { module: "api.scheduling.reschedule_feedback.send", action: "insert_email_log", branchId, scheduleId, instructorId },
        err: logErr,
      });
    }

    return NextResponse.json({
      success: true,
      request_id: reqRow.id,
      created_at: reqRow.created_at,
      expires_at: reqRow.expires_at,
      email: { to: toList, subject: email.subject, message_id: sendRes.messageId ?? null },
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in POST /api/scheduling/reschedule-feedback/send",
      context: { module: "api.scheduling.reschedule_feedback.send", action: "unhandled" },
      err,
    });
  }
}


