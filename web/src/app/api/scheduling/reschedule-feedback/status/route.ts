import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { serverErrorResponse } from "@/lib/server-api-error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return !!v && EMAIL_REGEX.test(v);
}

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
    if (!required.ok) return required.response;

    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get("branch_id");
    const scheduleId = String(searchParams.get("schedule_id") ?? "").trim();
    const instructorId = String(searchParams.get("instructor_id") ?? "").trim();

    if (!scheduleId || !instructorId) {
      return NextResponse.json({ error: "schedule_id and instructor_id are required" }, { status: 400 });
    }

    const access = required.access;
    const isBranchUser = access?.recipient_type === "Branch";
    const branchId = isBranchUser && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
    if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

    const supabase = createSupabaseServerClient();

    const [{ data: emailRows, error: emailErr }, { data: reqRows, error: reqErr }] = await Promise.all([
      supabase
        .from("schedule_reschedule_email_log")
        .select("sent_at, from_email, to_email, subject, message_id")
        .eq("branch_id", branchId)
        .eq("schedule_id", scheduleId)
        .eq("instructor_id", instructorId)
        .order("sent_at", { ascending: false })
        .limit(1),
      supabase
        .from("schedule_reschedule_requests")
        .select("id, created_at, expires_at, responded_at, response_selected_session_ids")
        .eq("branch_id", branchId)
        .eq("schedule_id", scheduleId)
        .eq("instructor_id", instructorId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // Resolve instructor email for display in the UI (even before any email is sent)
    const { data: instRow, error: instErr } = await supabase
      .from("instructors")
      .select("id, auth_user_id")
      .eq("id", instructorId)
      .maybeSingle<{ id: string; auth_user_id: string | null }>();
    if (instErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load instructor",
        logMessage: instErr.message,
        context: {
          module: "api.scheduling.reschedule_feedback.status",
          action: "select_instructor",
          branchId,
          scheduleId,
          instructorId,
        },
        err: instErr,
      });
    }

    let instructorEmail: string | null = null;
    if (instRow?.auth_user_id) {
      const { data: recRow } = await supabase
        .from("branch_schedule_recipients")
        .select("email, is_active")
        .eq("auth_user_id", instRow.auth_user_id)
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .maybeSingle<{ email: string | null; is_active: boolean }>();
      if (isValidEmail(recRow?.email)) instructorEmail = recRow!.email.trim().toLowerCase();
    }
    if (!instructorEmail) instructorEmail = "don.race@outlook.com";

    if (emailErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load email status",
        logMessage: emailErr.message,
        context: { module: "api.scheduling.reschedule_feedback.status", action: "select_email_log", branchId, scheduleId, instructorId },
        err: emailErr,
      });
    }
    if (reqErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load feedback status",
        logMessage: reqErr.message,
        context: { module: "api.scheduling.reschedule_feedback.status", action: "select_requests", branchId, scheduleId, instructorId },
        err: reqErr,
      });
    }

    const email = Array.isArray(emailRows) && emailRows.length > 0 ? emailRows[0] : null;
    const request = Array.isArray(reqRows) && reqRows.length > 0 ? reqRows[0] : null;

    return NextResponse.json({
      email,
      request,
      instructor_email: instructorEmail,
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/reschedule-feedback/status",
      context: { module: "api.scheduling.reschedule_feedback.status", action: "unhandled" },
      err,
    });
  }
}


