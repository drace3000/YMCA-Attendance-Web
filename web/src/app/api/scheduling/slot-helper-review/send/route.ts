import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { serverErrorResponse } from "@/lib/server-api-error";
import { sendEmail } from "@/lib/email-sender";
import { buildSlotHelperReviewRequestEmail } from "@/lib/reschedule-feedback-email-templates";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SendBody = {
  schedule_id: string;
  instructor_ids: string[];
  slots: Array<{ date: string; start_time: string; end_time: string }>;
  context?: {
    class_id?: string | null;
    location_id?: string | null;
    duration_minutes?: number | null;
    transition_minutes?: number | null;
    turnover_minutes?: number | null;
    schedule_month?: number | null;
    schedule_year?: number | null;
    availability_time_start?: string | null;
    availability_time_end?: string | null;
  };
  additional_emails?: string[];
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

function formatSlotLine(dateIso: string, startHHmm: string, endHHmm: string): string {
  const date = (() => {
    const d = new Date(dateIso);
    if (!Number.isFinite(d.getTime())) return dateIso;
    return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  })();
  const formatTime = (t: string): string => {
    const [hRaw, mRaw] = t.split(":");
    const h = Number(hRaw);
    const m = Number(mRaw);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return t;
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };
  return `${date} • ${formatTime(startHHmm)}–${formatTime(endHHmm)}`;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
    if (!required.ok) return required.response;

    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get("branch_id");

    let body: SendBody;
    try {
      body = (await req.json()) as SendBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const scheduleId = String(body.schedule_id ?? "").trim();
    const instructorIds = Array.isArray(body.instructor_ids)
      ? body.instructor_ids.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];
    const slots = Array.isArray(body.slots) ? body.slots : [];

    if (!scheduleId || instructorIds.length === 0 || slots.length === 0) {
      return NextResponse.json(
        { error: "schedule_id, instructor_ids (>=1), and slots (>=1) are required" },
        { status: 400 },
      );
    }

    const access = required.access;
    const isBranchUser = access?.recipient_type === "Branch";
    const branchId = isBranchUser && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
    if (!branchId) {
      return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
    }

    const useAdmin = "devPassthrough" in required && required.devPassthrough === true;
    const supabase = useAdmin ? supabaseAdmin : createSupabaseServerClient();

    const [{ data: scheduleRow, error: scheduleErr }, { data: branchRow, error: branchErr }] = await Promise.all([
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
        publicMessage: "Failed to load schedule",
        logMessage: scheduleErr?.message ?? "Schedule not found",
        context: { module: "api.scheduling.slot_helper_review.send", action: "select_schedule", branchId, scheduleId },
        err: scheduleErr ?? null,
      });
    }
    if (branchErr || !branchRow) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load branch",
        logMessage: branchErr?.message ?? "Branch not found",
        context: { module: "api.scheduling.slot_helper_review.send", action: "select_branch", branchId, scheduleId },
        err: branchErr ?? null,
      });
    }

    const toSet = new Set<string>();
    const instructorLabels: Array<{ id: string; label: string }> = [];

    for (const instructorId of instructorIds) {
      const { data: instRow, error: instErr } = await supabase
        .from("instructors")
        .select("id, nickname, first_name, last_name, auth_user_id")
        .eq("id", instructorId)
        .maybeSingle<{ id: string; nickname: string | null; first_name: string | null; last_name: string | null; auth_user_id: string | null }>();

      if (instErr) {
        return await serverErrorResponse({
          req,
          errorType: "DB_ERROR",
          publicMessage: "Failed to load instructor",
          logMessage: instErr.message,
          context: { module: "api.scheduling.slot_helper_review.send", action: "select_instructor", branchId, scheduleId, instructorId },
          err: instErr,
        });
      }

      const label =
        (instRow?.nickname || `${instRow?.first_name ?? ""} ${instRow?.last_name ?? ""}`.trim()).trim() || "Instructor";
      instructorLabels.push({ id: instructorId, label });

      let email: string | null = null;
      if (instRow?.auth_user_id) {
        const { data: recRow } = await supabase
          .from("branch_schedule_recipients")
          .select("email, is_active")
          .eq("auth_user_id", instRow.auth_user_id)
          .eq("branch_id", branchId)
          .eq("is_active", true)
          .maybeSingle<{ email: string | null; is_active: boolean }>();
        if (isValidEmail(recRow?.email)) email = recRow!.email.trim().toLowerCase();
      }
      if (!email) email = "don.race@outlook.com";
      toSet.add(email);
    }

    if (Array.isArray(body.additional_emails)) {
      for (const raw of body.additional_emails) {
        const v = String(raw ?? "").trim().toLowerCase();
        if (!isValidEmail(v)) continue;
        toSet.add(v);
      }
    }

    const toList = Array.from(toSet);
    const toEmailForLog = toList.join(", ");

    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const contextClassId = body.context?.class_id ? String(body.context.class_id) : null;
    const contextLocationId = body.context?.location_id ? String(body.context.location_id) : null;
    if (!contextClassId || !contextLocationId) {
      return NextResponse.json({ error: "class_id and location_id are required in context" }, { status: 400 });
    }

    const primaryInstructorId = instructorIds[0]!;
    const { data: reqRow, error: reqErr } = await supabase
      .from("slot_helper_review_requests")
      .insert({
        branch_id: branchId,
        schedule_id: scheduleId,
        class_id: contextClassId,
        location_id: contextLocationId,
        instructor_ids: instructorIds,
        request_token: token,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, created_at, expires_at")
      .single<{ id: string; created_at: string; expires_at: string }>();

    if (reqErr || !reqRow) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to create slot review request",
        logMessage: reqErr?.message ?? "Insert slot_helper_review_requests failed",
        context: { module: "api.scheduling.slot_helper_review.send", action: "insert_request", branchId, scheduleId, instructorId: primaryInstructorId },
        err: reqErr ?? null,
      });
    }

    const transitionMinutes = Number(body.context?.transition_minutes ?? 0) || 0;
    const turnoverMinutes = Number(body.context?.turnover_minutes ?? 0) || 0;

    const holdRows = slots.map((s) => ({
      request_id: reqRow.id,
      branch_id: branchId,
      schedule_id: scheduleId,
      class_id: contextClassId,
      location_id: contextLocationId,
      instructor_ids: instructorIds,
      slot_date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      transition_minutes: transitionMinutes,
      turnover_minutes: turnoverMinutes,
      expires_at: reqRow.expires_at,
    }));

    const { error: holdErr } = await supabase.from("slot_helper_slot_holds").insert(holdRows);
    if (holdErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to create slot holds",
        logMessage: holdErr.message,
        context: { module: "api.scheduling.slot_helper_review.send", action: "insert_holds", branchId, scheduleId, requestId: reqRow.id },
        err: holdErr,
      });
    }

    const baseUrl = getOrigin(req);
    const reviewUrl = `${baseUrl}/scheduling/slot-helper-review?t=${encodeURIComponent(token)}`;
    const scheduleLabel = scheduleRow.name || "Schedule";

    const [{ data: classRow }, { data: locationRow }] = await Promise.all([
      contextClassId
        ? supabase
            .from("classes")
            .select("id, name")
            .eq("branch_id", branchId)
            .eq("id", contextClassId)
            .maybeSingle<{ id: string; name: string }>()
        : Promise.resolve({ data: null } as { data: null }),
      contextLocationId
        ? supabase
            .from("locations")
            .select("id, code, name")
            .eq("branch_id", branchId)
            .eq("id", contextLocationId)
            .maybeSingle<{ id: string; code: string; name: string }>()
        : Promise.resolve({ data: null } as { data: null }),
    ]);

    const className = classRow?.name ?? (contextClassId ? contextClassId : "—");
    const locationLabel = locationRow
      ? `${locationRow.code} - ${locationRow.name}`
      : contextLocationId
        ? contextLocationId
        : "—";

    const nicknames = instructorLabels.map((x) => x.label).filter(Boolean).join(", ");
    const recipientLabel = nicknames ? `Instructor(s) ${nicknames}` : "Instructor(s)";

    const slotRows = slots.map((s) => ({
      dateTime: formatSlotLine(s.date, s.start_time, s.end_time),
      className,
      location: locationLabel,
    }));

    const email = buildSlotHelperReviewRequestEmail({
      branchName: branchRow.name,
      scheduleLabel,
      recipientLabel,
      reviewUrl,
      expiresAtIso: reqRow.expires_at,
      slotRows,
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
            : "Failed to send slot review email",
        logMessage: sendRes.message ?? sendRes.reason,
        context: {
          module: "api.scheduling.slot_helper_review.send",
          action: "send_email",
          branchId,
          scheduleId,
          instructorId: primaryInstructorId,
          toEmail: toEmailForLog,
        },
        err: sendRes.message ?? null,
      });
    }

    const { error: logErr } = await supabase.from("slot_helper_review_email_log").insert({
      request_id: reqRow.id,
      branch_id: branchId,
      schedule_id: scheduleId,
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
        context: { module: "api.scheduling.slot_helper_review.send", action: "insert_email_log", branchId, scheduleId, requestId: reqRow.id },
        err: logErr,
      });
    }

    const { error: sentErr } = await supabase
      .from("slot_helper_review_requests")
      .update({ sent_at: now.toISOString() })
      .eq("id", reqRow.id);
    if (sentErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Email sent, but failed to update request status",
        logMessage: sentErr.message,
        context: { module: "api.scheduling.slot_helper_review.send", action: "update_sent_at", branchId, scheduleId, requestId: reqRow.id },
        err: sentErr,
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
      logMessage: "Unhandled error in POST /api/scheduling/slot-helper-review/send",
      context: { module: "api.scheduling.slot_helper_review.send", action: "unhandled" },
      err,
    });
  }
}

