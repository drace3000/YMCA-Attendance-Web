import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serverErrorResponse } from "@/lib/server-api-error";
import { sendEmail } from "@/lib/email-sender";
import { buildSlotHelperReviewSubmittedEmail } from "@/lib/reschedule-feedback-email-templates";

type SubmitPayload = {
  t: string;
  selected_hold_ids: string[];
  comment?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return !!v && EMAIL_REGEX.test(v);
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

    const selected = Array.isArray(body.selected_hold_ids) ? body.selected_hold_ids : [];
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";

    // Token-based submit requires server-side access (service role recommended).
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server not configured for token-based review (missing SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 },
      );
    }

    const supabase = supabaseAdmin;

    const { data: row, error } = await supabase
      .from("slot_helper_review_requests")
      .select("id, branch_id, schedule_id, instructor_ids, expires_at")
      .eq("request_token", token)
      .maybeSingle<{
        id: string;
        branch_id: string;
        schedule_id: string;
        instructor_ids: string[];
        expires_at: string;
      }>();

    if (error || !row) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: error?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Review request not found",
        logMessage: error?.message ?? "Request not found",
        context: { module: "api.scheduling.slot_helper_review.submit", action: "select_request_by_token" },
        err: error ?? null,
      });
    }

    const now = new Date();
    const expiresAtMs = new Date(row.expires_at).getTime();
    if (!Number.isFinite(expiresAtMs) || now.getTime() > expiresAtMs) {
      return NextResponse.json({ error: "This link has expired." }, { status: 410 });
    }

    const { data: holdRows, error: holdErr } = await supabase
      .from("slot_helper_slot_holds")
      .select("id")
      .eq("request_id", row.id);
    if (holdErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load slot holds",
        logMessage: holdErr.message,
        context: { module: "api.scheduling.slot_helper_review.submit", action: "select_holds", requestId: row.id },
        err: holdErr,
      });
    }

    const allowed = new Set((holdRows ?? []).map((r: { id: string }) => r.id));
    const uniqueSelected = Array.from(new Set(selected.map((x) => String(x).trim()).filter(Boolean)));
    const invalid = uniqueSelected.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      return NextResponse.json({ error: "Invalid selection." }, { status: 400 });
    }

    const { error: updErr } = await supabase
      .from("slot_helper_review_requests")
      .update({
        responded_at: now.toISOString(),
        response_selected_hold_ids: uniqueSelected,
        response_comment: comment || null,
      })
      .eq("id", row.id);

    if (updErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to submit review",
        logMessage: updErr.message,
        context: { module: "api.scheduling.slot_helper_review.submit", action: "update_request", requestId: row.id },
        err: updErr,
      });
    }

    const deselected = (holdRows ?? [])
      .map((r: { id: string }) => r.id)
      .filter((id) => !uniqueSelected.includes(id));
    if (deselected.length > 0) {
      const { error: releaseErr } = await supabase
        .from("slot_helper_slot_holds")
        .update({ released_at: now.toISOString() })
        .in("id", deselected)
        .is("released_at", null);
      if (releaseErr) {
        return await serverErrorResponse({
          req,
          errorType: "DB_ERROR",
          publicMessage: "Failed to release deselected holds",
          logMessage: releaseErr.message,
          context: { module: "api.scheduling.slot_helper_review.submit", action: "release_holds", requestId: row.id },
          err: releaseErr,
        });
      }
    }

    // Notify branch manager
    const [{ data: branchRow }, { data: scheduleRow }] = await Promise.all([
      supabase
        .from("ymca_branches")
        .select("id, name, schedule_email_from, branch_manager_email")
        .eq("id", row.branch_id)
        .maybeSingle<{ id: string; name: string; schedule_email_from: string | null; branch_manager_email: string | null }>(),
      supabase.from("schedules").select("id, name").eq("id", row.schedule_id).maybeSingle<{ id: string; name: string }>(),
    ]);

    const branchName = branchRow?.name ?? "YMCA Branch";
    const scheduleLabel = scheduleRow?.name ?? "Schedule";
    const notifyTo = isValidEmail(branchRow?.branch_manager_email)
      ? branchRow!.branch_manager_email.trim().toLowerCase()
      : "don.race@outlook.com";

    const notify = buildSlotHelperReviewSubmittedEmail({
      branchName,
      scheduleLabel,
      selectedCount: uniqueSelected.length,
      comment: comment || null,
      feedbackReceivedAtIso: now.toISOString(),
    });

    const fromEmail = isValidEmail(branchRow?.schedule_email_from) ? branchRow!.schedule_email_from.trim().toLowerCase() : undefined;
    const sendRes = await sendEmail({
      fromName: `${branchName} Scheduler`,
      fromEmail,
      to: [notifyTo],
      subject: notify.subject,
      text: notify.text,
      html: notify.html,
    });

    if (sendRes.ok) {
      const primaryInstructorId = row.instructor_ids?.[0] ?? null;
      if (!primaryInstructorId) {
        return NextResponse.json({ success: true, responded_at: now.toISOString(), selected_count: uniqueSelected.length });
      }
      const { error: logErr } = await supabase.from("schedule_reschedule_submit_notify_log").insert({
        branch_id: row.branch_id,
        schedule_id: row.schedule_id,
        instructor_id: primaryInstructorId,
        notified_at: now.toISOString(),
        to_email: notifyTo,
        subject: notify.subject,
        message_id: sendRes.messageId ?? null,
      });
      if (logErr) {
        // Best-effort; don't fail instructor UX.
        console.error("[slot-helper-review] notify log insert failed:", logErr);
      }
    } else {
      // Best-effort; don't fail instructor UX.
      console.error("[slot-helper-review] notify email failed:", sendRes);
    }

    return NextResponse.json({ success: true, responded_at: now.toISOString(), selected_count: uniqueSelected.length });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in POST /api/scheduling/slot-helper-review/submit",
      context: { module: "api.scheduling.slot_helper_review.submit", action: "unhandled" },
      err,
    });
  }
}

