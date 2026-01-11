import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAuthRouteClient } from "@/lib/supabaseAuthRouteClient";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";

export type RecipientAccess = {
  email: string;
  recipient_type: "Administrator" | "Branch";
  is_active: boolean;
  needs_password_setup: boolean;
  last_login_at: string | null;
  branch_id: string;
  branch: { id: string; name: string } | null;
  association_id: string | null;
  alliance_id: string | null;
};

type RecipientRow = {
  id: string;
  email: string;
  recipient_type: "Administrator" | "Branch" | "Member" | "Normal";
  is_active: boolean;
  needs_password_setup: boolean;
  last_login_at: string | null;
  branch_id: string;
  branch?:
    | {
        id: string;
        name: string;
        association_id: string | null;
        association?:
          | { id: string; alliance_id: string | null }
          | { id: string; alliance_id: string | null }[]
          | null;
      }
    | {
        id: string;
        name: string;
        association_id: string | null;
        association?:
          | { id: string; alliance_id: string | null }
          | { id: string; alliance_id: string | null }[]
          | null;
      }[]
    | null;
};

type RequireAccessResult =
  | { ok: true; access: RecipientAccess }
  | { ok: false; response: Response }
  | { ok: true; access: null; devPassthrough: true };

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Load the current user's recipient record (role + branch hierarchy).
 *
 * Notes:
 * - In production/test, unauthenticated requests return 401.
 * - In local development, unauthenticated requests may optionally "passthrough"
 *   to preserve the existing DEV_AUTH_BYPASS workflow (no Supabase cookies).
 */
export async function requireRecipientAccess(
  req: NextRequest,
  opts?: { allowDevPassthrough?: boolean },
): Promise<RequireAccessResult> {
  const allowDevPassthrough =
    opts?.allowDevPassthrough === true && process.env.NODE_ENV === "development";

  const authClient = createSupabaseAuthRouteClient(req);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user?.email) {
    if (allowDevPassthrough) {
      return { ok: true, access: null, devPassthrough: true };
    }
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createSupabaseServerClient();
  const email = user.email.trim().toLowerCase();

  const { data: rawRecipient, error: recipientError } = await supabase
    .from("branch_schedule_recipients")
    .select(
      `
        id,
        email,
        recipient_type,
        is_active,
        needs_password_setup,
        last_login_at,
        branch_id,
        branch:branch_id (
          id,
          name,
          association_id,
          association:association_id (
            id,
            alliance_id
          )
        )
      `,
    )
    .eq("email", email)
    .maybeSingle();

  if (recipientError || !rawRecipient) {
    const status = recipientError?.code === "PGRST116" ? 403 : 500;
    return {
      ok: false,
      response: await serverErrorResponse({
        req,
        status,
        errorType: "DB_ERROR",
        publicMessage: status === 403 ? "Forbidden" : "Failed to load access context",
        logMessage: recipientError?.message ?? "Recipient not found",
        context: { module: "auth.require_access", action: "select_recipient", email },
        err: recipientError ?? null,
      }),
    };
  }

  const recipient = rawRecipient as unknown as RecipientRow;
  const recipientType =
    recipient.recipient_type === "Normal" ? "Branch" : recipient.recipient_type;
  if (recipientType === "Member") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (recipient.is_active === false) {
    return { ok: false, response: NextResponse.json({ error: "Account deactivated" }, { status: 403 }) };
  }

  const branchRel = normalizeRelation(recipient.branch);
  const assocRel = normalizeRelation(branchRel?.association);

  return {
    ok: true,
    access: {
      email,
      recipient_type: recipientType,
      is_active: !!recipient.is_active,
      needs_password_setup: !!recipient.needs_password_setup,
      last_login_at: recipient.last_login_at ?? null,
      branch_id: recipient.branch_id,
      branch: branchRel ? { id: branchRel.id, name: branchRel.name } : null,
      association_id: branchRel?.association_id ?? null,
      alliance_id: assocRel?.alliance_id ?? null,
    },
  };
}

