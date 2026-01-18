import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get("t") ?? "").trim();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    // Token-based page requires server-side access (service role recommended).
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server not configured for token-based feedback (missing SUPABASE_SERVICE_ROLE_KEY)" },
        { status: 500 },
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("schedule_reschedule_requests")
      .select("id, branch_id, schedule_id, instructor_id, request_payload, created_at, expires_at, responded_at, response_selected_session_ids")
      .eq("request_token", token)
      .maybeSingle<{
        id: string;
        branch_id: string;
        schedule_id: string;
        instructor_id: string;
        request_payload: any;
        created_at: string;
        expires_at: string;
        responded_at: string | null;
        response_selected_session_ids: string[];
      }>();

    if (error || !row) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        status: error?.code === "PGRST116" ? 404 : 500,
        publicMessage: "Feedback request not found",
        logMessage: error?.message ?? "Request not found",
        context: { module: "api.scheduling.reschedule_feedback.request", action: "select_request_by_token" },
        err: error ?? null,
      });
    }

    const now = Date.now();
    const expiresAtMs = new Date(row.expires_at).getTime();
    const expired = Number.isFinite(expiresAtMs) ? now > expiresAtMs : true;

    const [{ data: branchRow }, { data: scheduleRow }, { data: instRow }] = await Promise.all([
      supabase.from("ymca_branches").select("id, name").eq("id", row.branch_id).maybeSingle<{ id: string; name: string }>(),
      supabase.from("schedules").select("id, name").eq("id", row.schedule_id).maybeSingle<{ id: string; name: string }>(),
      supabase
        .from("instructors")
        .select("id, nickname, first_name, last_name")
        .eq("id", row.instructor_id)
        .maybeSingle<{ id: string; nickname: string | null; first_name: string | null; last_name: string | null }>(),
    ]);

    const instructorLabel =
      (instRow?.nickname || `${instRow?.first_name ?? ""} ${instRow?.last_name ?? ""}`.trim()).trim() || "Instructor";

    return NextResponse.json({
      expired,
      request: {
        id: row.id,
        created_at: row.created_at,
        expires_at: row.expires_at,
        responded_at: row.responded_at,
        response_selected_session_ids: row.response_selected_session_ids ?? [],
        request_payload: row.request_payload ?? {},
      },
      context: {
        branch_id: row.branch_id,
        schedule_id: row.schedule_id,
        instructor_id: row.instructor_id,
        branch_name: branchRow?.name ?? null,
        schedule_name: scheduleRow?.name ?? null,
        instructor_label: instructorLabel,
      },
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/reschedule-feedback/request",
      context: { module: "api.scheduling.reschedule_feedback.request", action: "unhandled" },
      err,
    });
  }
}


