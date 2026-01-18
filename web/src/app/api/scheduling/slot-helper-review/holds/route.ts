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

    if (!scheduleId) return NextResponse.json({ error: "schedule_id is required" }, { status: 400 });

    const access = required.access;
    const isBranchUser = access?.recipient_type === "Branch";
    const branchId = isBranchUser && access ? access.branch_id : requestedBranchId ?? access?.branch_id ?? null;
    if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

    const useAdmin = "devPassthrough" in required && required.devPassthrough === true;
    const supabase = useAdmin ? supabaseAdmin : createSupabaseServerClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("slot_helper_slot_holds")
      .select(
        "id, request_id, class_id, location_id, instructor_ids, slot_date, start_time, end_time, transition_minutes, turnover_minutes, expires_at",
      )
      .eq("branch_id", branchId)
      .eq("schedule_id", scheduleId)
      .gt("expires_at", nowIso)
      .is("released_at", null)
      .is("consumed_at", null)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load slot holds",
        logMessage: error.message,
        context: { module: "api.scheduling.slot_helper_review.holds", action: "select_holds", branchId, scheduleId },
        err: error,
      });
    }

    return NextResponse.json({
      holds: (data ?? []).map((h: any) => ({
        id: h.id,
        request_id: h.request_id,
        class_id: h.class_id ?? null,
        location_id: h.location_id ?? null,
        instructor_ids: Array.isArray(h.instructor_ids) ? h.instructor_ids : [],
        slot_date: String(h.slot_date),
        start_time: String(h.start_time).slice(0, 5),
        end_time: String(h.end_time).slice(0, 5),
        transition_minutes: h.transition_minutes ?? 0,
        turnover_minutes: h.turnover_minutes ?? 0,
        expires_at: h.expires_at,
      })),
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/slot-helper-review/holds",
      context: { module: "api.scheduling.slot_helper_review.holds", action: "unhandled" },
      err,
    });
  }
}
