import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";
import { sendEmail } from "@/lib/email-sender";
import { buildRescheduleFeedbackSubmittedEmail } from "@/lib/reschedule-feedback-email-templates";

type SubmitPayload = {
  t: string;
  selected_session_ids: string[];
  comment?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return !!v && EMAIL_REGEX.test(v);
}

function extractAllowedSessionIds(payload: unknown): Set<string> {
  const root = payload as any;
  const rows = Array.isArray(root?.rows) ? root.rows : [];
  const ids = new Set<string>();
  for (const r of rows) {
    const sessionId = typeof r?.session_id === "string" ? r.session_id : null;
    const hasProposal = r?.proposed && typeof r.proposed?.date === "string";
    if (sessionId && hasProposal) ids.add(sessionId);
  }
  return ids;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: SubmitPayload;
    try {
      body = (await req.json()) as SubmitPayload;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const token = String(body.t ?? "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const selected = Array.isArray(body.selected_session_ids) ? body.selected_session_ids : [];
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";

    // Token-based submit requires server-side access (service role recommended).
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server not configured for token-based feedback (missing SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 },
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("schedule_reschedule_requests")
      .select("id, branch_id, schedule_id, instructor_id, request_payload, expires_at")
      .eq("request_token", token)
      .maybeSingle<{
        id: string;
        branch_id: string;
        schedule_id: string;
        instructor_id: string;
        request_payload: any;
        expires_at: string;
      }>();

    if (error || !row) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: error?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Feedback request not found",
        logMessage: error?.message ?? "Request not found",
        context: { module: "api.scheduling.reschedule_feedback.submit", action: "select_request_by_token" },
        err: error ?? null,
      });
    }

    const now = new Date();
    const expiresAtMs = new Date(row.expires_at).getTime();
    if (!Number.isFinite(expiresAtMs) || now.getTime() > expiresAtMs) {
      return NextResponse.json({ error: "This link has expired." }, { status: 410 });
    }

    const allowed = extractAllowedSessionIds(row.request_payload);
    const uniqueSelected = Array.from(new Set(selected.map((x) => String(x).trim()).filter(Boolean)));
    const invalid = uniqueSelected.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      return NextResponse.json({ error: "Invalid selection." }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from("schedule_reschedule_requests")
      .update({
        responded_at: now.toISOString(),
        response_selected_session_ids: uniqueSelected,
        response_comment: comment || null,
      })
      .eq("id", row.id);

    if (updErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to save feedback",
        logMessage: updErr.message,
        context: { module: "api.scheduling.reschedule_feedback.submit", action: "update_request", requestId: row.id },
        err: updErr,
      });
    }

    // Notify branch manager
    const [{ data: branchRow }, { data: scheduleRow }, { data: instRow }] = await Promise.all([
      supabase
        .from("ymca_branches")
        .select("id, name, schedule_email_from, branch_manager_email")
        .eq("id", row.branch_id)
        .maybeSingle<{ id: string; name: string; schedule_email_from: string | null; branch_manager_email: string | null }>(),
      supabase.from("schedules").select("id, name").eq("id", row.schedule_id).maybeSingle<{ id: string; name: string }>(),
      supabase
        .from("instructors")
        .select("id, nickname, first_name, last_name")
        .eq("id", row.instructor_id)
        .maybeSingle<{ id: string; nickname: string | null; first_name: string | null; last_name: string | null }>(),
    ]);

    const branchName = branchRow?.name ?? "YMCA Branch";
    const scheduleLabel = scheduleRow?.name ?? "Schedule";
    const instructorLabel =
      (instRow?.nickname || `${instRow?.first_name ?? ""} ${instRow?.last_name ?? ""}`.trim()).trim() || "Instructor";

    const notifyTo =
      isValidEmail(branchRow?.branch_manager_email) ? branchRow!.branch_manager_email.trim().toLowerCase() : "don.race@outlook.com";

    const notify = buildRescheduleFeedbackSubmittedEmail({
      branchName,
      scheduleLabel,
      instructorLabel,
      selectedCount: uniqueSelected.length,
      feedbackReceivedAtIso: now.toISOString(),
    });

    const fromEmail =
      isValidEmail(branchRow?.schedule_email_from) ? branchRow!.schedule_email_from.trim().toLowerCase() : undefined;

    const sendRes = await sendEmail({
      fromName: `${branchName} Scheduler`,
      fromEmail,
      to: [notifyTo],
      subject: notify.subject,
      text: notify.text,
      html: notify.html,
    });

    if (sendRes.ok) {
      const { error: logErr } = await supabase.from("schedule_reschedule_submit_notify_log").insert({
        branch_id: row.branch_id,
        schedule_id: row.schedule_id,
        instructor_id: row.instructor_id,
        notified_at: now.toISOString(),
        to_email: notifyTo,
        subject: notify.subject,
        message_id: sendRes.messageId ?? null,
      });
      if (logErr) {
        // Best-effort; don't fail instructor UX.
        console.error("[reschedule-feedback] notify log insert failed:", logErr);
      }
    } else {
      // Best-effort; don't fail instructor UX.
      console.error("[reschedule-feedback] notify email failed:", sendRes);
    }

    return NextResponse.json({ success: true, responded_at: now.toISOString(), selected_count: uniqueSelected.length });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in POST /api/scheduling/reschedule-feedback/submit",
      context: { module: "api.scheduling.reschedule_feedback.submit", action: "unhandled" },
      err,
    });
  }
}


