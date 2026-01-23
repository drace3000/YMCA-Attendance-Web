import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoginContextRequest = {
  email: string;
};

export type LoginContextResponse = {
  recipient: {
    id: string;
    email: string;
    recipient_type: "Administrator" | "Branch";
    branch_id: string;
    association_id: string | null;
    alliance_id: string | null;
    is_active: boolean;
    needs_password_setup: boolean;
    last_login_at: string | null;
  };
  branch: {
    id: string;
    name: string;
  } | null;
};

export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: LoginContextRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    // SECURITY: In production, require a valid Supabase access token and ensure it matches the requested email.
    // (In local dev, we allow email-only passthrough for the DEV_AUTH_BYPASS workflow.)
    const allowDevPassthrough =
      process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

    const authHeader = req.headers.get("authorization");
    const bearer = authHeader?.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;

    if (!bearer && !allowDevPassthrough) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (bearer) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(bearer);

      const authedEmail = user?.email?.trim().toLowerCase() ?? null;
      if (userError || !authedEmail) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (authedEmail !== email) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { data: recipient, error: recipientError } = await supabase
      .from("branch_schedule_recipients")
      .select("id, email, recipient_type, branch_id, is_active, needs_password_setup, last_login_at")
      .eq("email", email)
      .single();

    if (recipientError || !recipient) {
      const status = recipientError?.code === "PGRST116" ? 404 : 500;
      return await serverErrorResponse({
        req,
        status,
        errorType: "DB_ERROR",
        publicMessage: status === 404 ? "Account not found" : "Failed to load login context",
        logMessage: recipientError?.message ?? "Recipient not found",
        context: { module: "api.auth.login_context", action: "select_recipient", email },
        err: recipientError ?? null,
      });
    }

    if (recipient.is_active === false) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }

    const recipientType =
      recipient.recipient_type === "Normal" ? "Branch" : recipient.recipient_type;
    if (recipientType === "Member") {
      return NextResponse.json({ error: "Account not permitted" }, { status: 403 });
    }

    // Load branch + hierarchy (best-effort)
    const { data: rawBranch } = await supabase
      .from("ymca_branches")
      .select(
        `
          id,
          name,
          association_id,
          association:association_id (
            id,
            alliance_id
          )
        `,
      )
      .eq("id", recipient.branch_id)
      .single();

    // Non-fatal, still return recipient context even if branch lookup fails.

    const branch = rawBranch as
      | {
          id: string;
          name: string;
          association_id: string | null;
          association:
            | { id: string; alliance_id: string | null }
            | { id: string; alliance_id: string | null }[]
            | null;
        }
      | null;
    const assocRel = Array.isArray(branch?.association)
      ? branch?.association[0] ?? null
      : branch?.association ?? null;

    // If password setup is NOT required, set last_login_at immediately
    if (!recipient.needs_password_setup) {
      const { error: loginUpdateError } = await supabase
        .from("branch_schedule_recipients")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", recipient.id);

      if (loginUpdateError) {
        return await serverErrorResponse({
          req,
          errorType: "DB_ERROR",
          publicMessage: "Failed to update login timestamp",
          logMessage: loginUpdateError.message,
          context: { module: "api.auth.login_context", action: "update_last_login_at", recipientId: recipient.id },
          err: loginUpdateError,
        });
      }
    }

    const response: LoginContextResponse = {
      recipient: {
        id: recipient.id,
        email: recipient.email,
        recipient_type: recipientType,
        branch_id: recipient.branch_id,
        association_id: branch?.association_id ?? null,
        alliance_id: assocRel?.alliance_id ?? null,
        is_active: !!recipient.is_active,
        needs_password_setup: !!recipient.needs_password_setup,
        last_login_at: recipient.last_login_at ?? null,
      },
      branch: branch ? { id: branch.id, name: branch.name } : null,
    };

    return NextResponse.json(response);
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: err instanceof Error ? err.message : "Unknown error",
      context: { module: "api.auth.login_context", action: "unhandled" },
      err,
    });
  }
}

