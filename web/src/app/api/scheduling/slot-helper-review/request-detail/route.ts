import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { serverErrorResponse } from "@/lib/server-api-error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
    if (!required.ok) return required.response;

    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get("branch_id");
    const requestId = String(searchParams.get("request_id") ?? "").trim();

    if (!requestId) return NextResponse.json({ error: "request_id is required" }, { status: 400 });

    const access = required.access;
    const isBranchUser = access?.recipient_type === "Branch";
    const branchId = isBranchUser && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
    if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

    const useAdmin = "devPassthrough" in required && required.devPassthrough === true;
    const supabase = useAdmin ? supabaseAdmin : createSupabaseServerClient();
    const { data: requestRow, error: requestErr } = await supabase
      .from("slot_helper_review_requests")
      .select(
        "id, branch_id, schedule_id, class_id, location_id, instructor_ids, created_at, expires_at, sent_at, responded_at, response_selected_hold_ids, response_comment, completed_at, overridden_at",
      )
      .eq("id", requestId)
      .eq("branch_id", branchId)
      .maybeSingle();

    if (requestErr || !requestRow) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: requestErr?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Slot helper request not found",
        logMessage: requestErr?.message ?? "Request not found",
        context: { module: "api.scheduling.slot_helper_review.request_detail", action: "select_request", requestId, branchId },
        err: requestErr ?? null,
      });
    }

    const [{ data: holds, error: holdsErr }, { data: emailRows, error: emailErr }] = await Promise.all([
      supabase
        .from("slot_helper_slot_holds")
        .select(
          "id, slot_date, start_time, end_time, released_at, consumed_at, transition_minutes, turnover_minutes",
        )
        .eq("request_id", requestId)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from("slot_helper_review_email_log")
        .select("sent_at, from_email, to_email, subject, message_id")
        .eq("request_id", requestId)
        .order("sent_at", { ascending: false })
        .limit(1),
    ]);

    if (emailErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load email log",
        logMessage: emailErr.message,
        context: { module: "api.scheduling.slot_helper_review.request_detail", action: "select_email_log", requestId, branchId },
        err: emailErr,
      });
    }

    const latestEmail = Array.isArray(emailRows) ? emailRows[0] ?? null : null;

    if (holdsErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load slot holds",
        logMessage: holdsErr.message,
        context: { module: "api.scheduling.slot_helper_review.request_detail", action: "select_holds", requestId, branchId },
        err: holdsErr,
      });
    }

    const expiresAtMs = new Date(requestRow.expires_at).getTime();
    const expired = Number.isFinite(expiresAtMs) ? Date.now() > expiresAtMs : true;

    return NextResponse.json({
      expired,
      request: requestRow,
      email: latestEmail,
      holds: (holds ?? []).map((h: any) => ({
        id: h.id,
        slot_date: String(h.slot_date),
        start_time: String(h.start_time).slice(0, 5),
        end_time: String(h.end_time).slice(0, 5),
        released_at: h.released_at ?? null,
        consumed_at: h.consumed_at ?? null,
        transition_minutes: h.transition_minutes ?? 0,
        turnover_minutes: h.turnover_minutes ?? 0,
      })),
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/slot-helper-review/request-detail",
      context: { module: "api.scheduling.slot_helper_review.request_detail", action: "unhandled" },
      err,
    });
  }
}
