import { NextResponse, type NextRequest } from "next/server";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";
import { serverErrorResponse } from "@/lib/server-api-error";
import { createSupabaseAuthRouteClient } from "@/lib/supabaseAuthRouteClient";

export const runtime = "nodejs";

type ModalOffset = { x: number; y: number };

const SCOPE = "smart_scheduler";
const KEY_ADD = "add_session_modal_offset";
const KEY_EDIT = "edit_session_modal_offset";
const KEY_RESCHEDULE = "reschedule_preview_modal_offset";
const KEY_RESCHEDULE_EMAIL = "reschedule_email_modal_offset";
const KEY_SLOT_HELPER_REVIEW_EMAIL = "slot_helper_review_email_modal_offset";
const KEY_SLOT_HELPER_MULTI_DAY_MODAL_OFFSET = "slot_helper_multi_day_modal_offset";
const KEY_SLOT_HELPER_WEEKDAYS = "slot_helper_weekdays";
const KEY_SLOT_HELPER_AUTO_LOCATE = "slot_helper_auto_locate";
const KEY_SLOT_HELPER_DATE_FILTER = "slot_helper_date_filter";
const KEY_SLOT_HELPER_DATE_COLLAPSE = "slot_helper_date_collapse";
const ALLOWED_KEYS = new Set<string>([
  KEY_ADD,
  KEY_EDIT,
  KEY_RESCHEDULE,
  KEY_RESCHEDULE_EMAIL,
  KEY_SLOT_HELPER_REVIEW_EMAIL,
  KEY_SLOT_HELPER_MULTI_DAY_MODAL_OFFSET,
  KEY_SLOT_HELPER_WEEKDAYS,
  KEY_SLOT_HELPER_AUTO_LOCATE,
  KEY_SLOT_HELPER_DATE_FILTER,
  KEY_SLOT_HELPER_DATE_COLLAPSE,
]);

function isModalOffset(value: unknown): value is ModalOffset {
  return (
    typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    Number.isFinite((value as { x: number }).x) &&
    Number.isFinite((value as { y: number }).y)
  );
}

function resolveBranchId(opts: {
  access: { recipient_type: "Administrator" | "Branch"; branch_id: string } | null;
  requestedBranchId: string | null;
}): string | null {
  const { access, requestedBranchId } = opts;
  if (access?.recipient_type === "Branch") return access.branch_id;
  return requestedBranchId ?? access?.branch_id ?? null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  if ("devPassthrough" in required && required.devPassthrough) {
    return NextResponse.json({
      addOffset: null,
      editOffset: null,
      rescheduleOffset: null,
      rescheduleEmailOffset: null,
      slotHelperReviewEmailOffset: null,
      slotHelperMultiDayOffset: null,
      slotHelperWeekdays: null,
      slotHelperAutoLocate: null,
      slotHelperDateFilter: null,
      slotHelperDateCollapse: null,
      dev_passthrough: true,
    });
  }

  try {
    const { searchParams } = new URL(req.url);
    const requestedBranchId = searchParams.get("branch_id")?.trim() || null;
    const branchId = resolveBranchId({ access: required.access, requestedBranchId });
    if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

    // Fetch current auth user (needed for user-scoped preferences).
    const authClient = createSupabaseAuthRouteClient(req);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rows, error } = await authClient
      .from("branch_user_ui_state")
      .select("key, value")
      .eq("branch_id", branchId)
      .eq("user_id", user.id)
      .eq("scope", SCOPE)
      .in("key", [
        KEY_ADD,
        KEY_EDIT,
        KEY_RESCHEDULE,
        KEY_RESCHEDULE_EMAIL,
        KEY_SLOT_HELPER_REVIEW_EMAIL,
        KEY_SLOT_HELPER_MULTI_DAY_MODAL_OFFSET,
        KEY_SLOT_HELPER_WEEKDAYS,
        KEY_SLOT_HELPER_AUTO_LOCATE,
        KEY_SLOT_HELPER_DATE_FILTER,
        KEY_SLOT_HELPER_DATE_COLLAPSE,
      ]);

    if (error) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to load UI preferences",
        logMessage: error.message,
        context: { module: "api.scheduling.ui_state", action: "select_ui_state", branchId, userId: user.id },
        err: error,
      });
    }

    const mapOffsets = new Map<string, ModalOffset>();
    const mapWeekdays = new Map<string, string[]>();
    const mapDateFilter = new Map<string, string[]>();
    const mapDateCollapse = new Map<string, Record<string, boolean>>();
    const mapBooleans = new Map<string, boolean>();
    for (const row of (rows ?? []) as Array<{ key: string; value: unknown }>) {
      if (!row?.key) continue;
      if (!ALLOWED_KEYS.has(row.key)) continue;
      if (row.key === KEY_SLOT_HELPER_WEEKDAYS) {
        if (Array.isArray(row.value) && row.value.every((v) => typeof v === "string")) {
          mapWeekdays.set(row.key, row.value as string[]);
        }
        continue;
      }
      if (row.key === KEY_SLOT_HELPER_AUTO_LOCATE) {
        if (typeof row.value === "boolean") {
          mapBooleans.set(row.key, row.value);
        }
        continue;
      }
      if (row.key === KEY_SLOT_HELPER_DATE_FILTER) {
        if (Array.isArray(row.value) && row.value.every((v) => typeof v === "string")) {
          mapDateFilter.set(row.key, row.value as string[]);
        }
        continue;
      }
      if (row.key === KEY_SLOT_HELPER_DATE_COLLAPSE) {
        if (
          typeof row.value === "object" &&
          row.value !== null &&
          Object.values(row.value).every((v) => typeof v === "boolean")
        ) {
          mapDateCollapse.set(row.key, row.value as Record<string, boolean>);
        }
        continue;
      }
      if (!isModalOffset(row.value)) continue;
      mapOffsets.set(row.key, row.value);
    }

    return NextResponse.json({
      addOffset: mapOffsets.get(KEY_ADD) ?? null,
      editOffset: mapOffsets.get(KEY_EDIT) ?? null,
      rescheduleOffset: mapOffsets.get(KEY_RESCHEDULE) ?? null,
      rescheduleEmailOffset: mapOffsets.get(KEY_RESCHEDULE_EMAIL) ?? null,
      slotHelperReviewEmailOffset: mapOffsets.get(KEY_SLOT_HELPER_REVIEW_EMAIL) ?? null,
      slotHelperMultiDayOffset: mapOffsets.get(KEY_SLOT_HELPER_MULTI_DAY_MODAL_OFFSET) ?? null,
      slotHelperWeekdays: mapWeekdays.get(KEY_SLOT_HELPER_WEEKDAYS) ?? null,
      slotHelperAutoLocate: mapBooleans.get(KEY_SLOT_HELPER_AUTO_LOCATE) ?? null,
      slotHelperDateFilter: mapDateFilter.get(KEY_SLOT_HELPER_DATE_FILTER) ?? null,
      slotHelperDateCollapse: mapDateCollapse.get(KEY_SLOT_HELPER_DATE_COLLAPSE) ?? null,
    });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in GET /api/scheduling/ui-state",
      context: { module: "api.scheduling.ui_state", action: "unhandled_get" },
      err,
    });
  }
}

type UpsertBody =
  | { branch_id?: string; key: typeof KEY_SLOT_HELPER_WEEKDAYS; value: string[] }
  | { branch_id?: string; key: typeof KEY_SLOT_HELPER_AUTO_LOCATE; value: boolean }
  | { branch_id?: string; key: typeof KEY_SLOT_HELPER_DATE_FILTER; value: string[] }
  | { branch_id?: string; key: typeof KEY_SLOT_HELPER_DATE_COLLAPSE; value: Record<string, boolean> }
  | { branch_id?: string; key: string; value: ModalOffset };

export async function POST(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  if ("devPassthrough" in required && required.devPassthrough) {
    return NextResponse.json({ ok: true, dev_passthrough: true });
  }

  try {
    let body: UpsertBody;
    try {
      body = (await req.json()) as UpsertBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const requestedBranchId = String(body.branch_id ?? "").trim() || null;
    const branchId = resolveBranchId({ access: required.access, requestedBranchId });
    if (!branchId) return NextResponse.json({ error: "branch_id is required" }, { status: 400 });

    // Branch users cannot write preferences for other branches
    if (required.access?.recipient_type === "Branch" && required.access.branch_id !== branchId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const key = String(body.key ?? "").trim();
    if (!ALLOWED_KEYS.has(key)) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    if (key === KEY_SLOT_HELPER_WEEKDAYS || key === KEY_SLOT_HELPER_DATE_FILTER) {
      if (!Array.isArray(body.value) || !body.value.every((v) => typeof v === "string")) {
        return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      }
    } else if (key === KEY_SLOT_HELPER_AUTO_LOCATE) {
      if (typeof body.value !== "boolean") {
        return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      }
    } else if (key === KEY_SLOT_HELPER_DATE_COLLAPSE) {
      if (
        typeof body.value !== "object" ||
        body.value === null ||
        !Object.values(body.value).every((v) => typeof v === "boolean")
      ) {
        return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      }
    } else {
      if (!isModalOffset((body as { value: ModalOffset }).value)) {
        return NextResponse.json({ error: "Invalid value" }, { status: 400 });
      }
    }

    const authClient = createSupabaseAuthRouteClient(req);
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await authClient.from("branch_user_ui_state").upsert(
      {
        branch_id: branchId,
        user_id: user.id,
        scope: SCOPE,
        key,
        value: body.value as never,
      },
      { onConflict: "branch_id,user_id,scope,key" },
    );

    if (error) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to save UI preferences",
        logMessage: error.message,
        context: { module: "api.scheduling.ui_state", action: "upsert_ui_state", branchId, userId: user.id, key },
        err: error,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: "Unhandled error in POST /api/scheduling/ui-state",
      context: { module: "api.scheduling.ui_state", action: "unhandled_post" },
      err,
    });
  }
}


