import { NextResponse, type NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { serverErrorResponse } from "@/lib/server-api-error";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get("t") ?? "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    // Token-based page requires server-side access (service role recommended).
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server not configured for token-based review (missing SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 },
      );
    }

    const supabase = supabaseAdmin;

    const { data: row, error } = await supabase
      .from("slot_helper_review_requests")
      .select(
        "id, branch_id, schedule_id, created_at, expires_at, responded_at, response_selected_hold_ids, response_comment",
      )
      .eq("request_token", token)
      .maybeSingle<{
        id: string;
        branch_id: string;
        schedule_id: string;
        created_at: string;
        expires_at: string;
        responded_at: string | null;
        response_selected_hold_ids: string[];
        response_comment: string | null;
      }>();

    if (error || !row) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: error?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Review request not found",
        logMessage: error?.message ?? "Request not found",
        context: { module: "api.scheduling.slot_helper_review.request", action: "select_request_by_token" },
        err: error ?? null,
      });
    }

    const { data: holds, error: holdsErr } = await supabase
      .from("slot_helper_slot_holds")
      .select("id, slot_date, start_time, end_time, released_at, consumed_at")
      .eq("request_id", row.id)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (holdsErr) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load slot holds",
        logMessage: holdsErr.message,
        context: { module: "api.scheduling.slot_helper_review.request", action: "select_holds", requestId: row.id },
        err: holdsErr,
      });
    }

    const now = Date.now();
    const expiresAtMs = new Date(row.expires_at).getTime();
    const expired = Number.isFinite(expiresAtMs) ? now > expiresAtMs : true;

    const [{ data: branchRow }, { data: scheduleRow }] = await Promise.all([
      supabase.from("ymca_branches").select("id, name").eq("id", row.branch_id).maybeSingle<{ id: string; name: string }>(),
      supabase.from("schedules").select("id, name").eq("id", row.schedule_id).maybeSingle<{ id: string; name: string }>(),
    ]);

    return NextResponse.json({
      expired,
      request: {
        id: row.id,
        created_at: row.created_at,
        expires_at: row.expires_at,
        responded_at: row.responded_at,
        response_selected_hold_ids: row.response_selected_hold_ids ?? [],
        response_comment: row.response_comment ?? null,
      },
      holds: (holds ?? []).map((h: { id: string; slot_date: string; start_time: string; end_time: string; released_at: string | null; consumed_at: string | null }) => ({
        id: h.id,
        slot_date: String(h.slot_date),
        start_time: String(h.start_time).slice(0, 5),
        end_time: String(h.end_time).slice(0, 5),
        released_at: h.released_at ?? null,
        consumed_at: h.consumed_at ?? null,
      })),
      context: {
        branch_id: row.branch_id,
        schedule_id: row.schedule_id,
        branch_name: branchRow?.name ?? null,
        schedule_name: scheduleRow?.name ?? null,
      },
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/slot-helper-review/request",
      context: { module: "api.scheduling.slot_helper_review.request", action: "unhandled" },
      err,
    });
  }
}

