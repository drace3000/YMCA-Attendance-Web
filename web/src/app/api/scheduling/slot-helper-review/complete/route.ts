import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { serverErrorResponse } from "@/lib/server-api-error";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CompleteBody = {
  request_id: string;
};

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
    if (!required.ok) return required.response;

    let body: CompleteBody;
    try {
      body = (await req.json()) as CompleteBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const requestId = String(body.request_id ?? "").trim();
    if (!requestId) return NextResponse.json({ error: "request_id is required" }, { status: 400 });

    const access = required.access;
    const branchId = access?.branch_id ?? null;
    if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

    const useAdmin = "devPassthrough" in required && required.devPassthrough === true;
    const supabase = useAdmin ? supabaseAdmin : createSupabaseServerClient();
    const nowIso = new Date().toISOString();

    const { error: requestErr } = await supabase
      .from("slot_helper_review_requests")
      .update({ completed_at: nowIso })
      .eq("id", requestId)
      .eq("branch_id", branchId);

    if (requestErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to complete slot helper request",
        logMessage: requestErr.message,
        context: { module: "api.scheduling.slot_helper_review.complete", action: "update_request", requestId, branchId },
        err: requestErr,
      });
    }

    const { error: releaseErr } = await supabase
      .from("slot_helper_slot_holds")
      .update({ released_at: nowIso })
      .eq("request_id", requestId)
      .is("released_at", null)
      .is("consumed_at", null);

    if (releaseErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to release slot holds",
        logMessage: releaseErr.message,
        context: { module: "api.scheduling.slot_helper_review.complete", action: "release_holds", requestId, branchId },
        err: releaseErr,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in POST /api/scheduling/slot-helper-review/complete",
      context: { module: "api.scheduling.slot_helper_review.complete", action: "unhandled" },
      err,
    });
  }
}
