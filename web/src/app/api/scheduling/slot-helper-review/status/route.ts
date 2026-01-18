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
    const scheduleId = String(searchParams.get("schedule_id") ?? "").trim();

    if (!scheduleId) {
      return NextResponse.json({ error: "schedule_id is required" }, { status: 400 });
    }

    const access = required.access;
    const isBranchUser = access?.recipient_type === "Branch";
    const branchId = isBranchUser && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
    if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

    const useAdmin = "devPassthrough" in required && required.devPassthrough === true;
    const supabase = useAdmin ? supabaseAdmin : createSupabaseServerClient();

    const [{ data: emailRows, error: emailErr }, { data: reqRows, error: reqErr }] = await Promise.all([
      supabase
        .from("slot_helper_review_email_log")
        .select("sent_at, from_email, to_email, subject, message_id")
        .eq("branch_id", branchId)
        .eq("schedule_id", scheduleId)
        .order("sent_at", { ascending: false })
        .limit(20),
      supabase
        .from("slot_helper_review_requests")
        .select("id, created_at, expires_at, sent_at, responded_at, response_selected_hold_ids, response_comment, completed_at, overridden_at")
        .eq("branch_id", branchId)
        .eq("schedule_id", scheduleId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (emailErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load email status",
        logMessage: emailErr.message,
        context: { module: "api.scheduling.slot_helper_review.status", action: "select_email_log", branchId, scheduleId },
        err: emailErr,
      });
    }
    if (reqErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load review status",
        logMessage: reqErr.message,
        context: { module: "api.scheduling.slot_helper_review.status", action: "select_requests", branchId, scheduleId },
        err: reqErr,
      });
    }

    const latestEmail = (Array.isArray(emailRows) ? emailRows : [])[0] ?? null;
    const latestRequest = (Array.isArray(reqRows) ? reqRows : [])[0] ?? null;

    let payloadSlots: Array<{ hold_id: string; proposed: { date: string; start_time: string; end_time: string } }> = [];
    if (latestRequest?.id) {
      const { data: holdRows } = await supabase
        .from("slot_helper_slot_holds")
        .select("id, slot_date, start_time, end_time")
        .eq("request_id", latestRequest.id)
        .order("slot_date", { ascending: true })
        .order("start_time", { ascending: true });
      payloadSlots = (holdRows ?? [])
        .map((r: { id: string; slot_date: string; start_time: string; end_time: string }) => ({
          hold_id: r.id,
          proposed: { date: String(r.slot_date), start_time: String(r.start_time).slice(0, 5), end_time: String(r.end_time).slice(0, 5) },
        }))
        .filter((x) => !!x.hold_id);
    }

    return NextResponse.json({
      email: latestEmail,
      request: latestRequest
        ? {
            created_at: latestRequest.created_at,
            expires_at: latestRequest.expires_at,
            sent_at: latestRequest.sent_at ?? null,
            responded_at: latestRequest.responded_at ?? null,
            response_selected_hold_ids: latestRequest.response_selected_hold_ids ?? [],
            response_comment: latestRequest.response_comment ?? null,
            completed_at: latestRequest.completed_at ?? null,
            overridden_at: latestRequest.overridden_at ?? null,
            payload_slots: payloadSlots,
          }
        : null,
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/slot-helper-review/status",
      context: { module: "api.scheduling.slot_helper_review.status", action: "unhandled" },
      err,
    });
  }
}

