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
    const { data, error } = await supabase
      .from("slot_helper_review_requests")
      .select(
        "id, created_at, expires_at, sent_at, responded_at, completed_at, overridden_at, class_id, location_id, instructor_ids",
      )
      .eq("branch_id", branchId)
      .eq("schedule_id", scheduleId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load slot helper requests",
        logMessage: error.message,
        context: { module: "api.scheduling.slot_helper_review.requests", action: "select_requests", branchId, scheduleId },
        err: error,
      });
    }

    return NextResponse.json({ requests: data ?? [] });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/slot-helper-review/requests",
      context: { module: "api.scheduling.slot_helper_review.requests", action: "unhandled" },
      err,
    });
  }
}
