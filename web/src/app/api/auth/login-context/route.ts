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
    recipient_type: "Administrator" | "Normal";
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

    // Load branch + hierarchy (best-effort)
    const { data: rawBranch, error: branchError } = await supabase
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

    if (branchError && branchError.code !== "PGRST116") {
      // Non-fatal, still return recipient context
      // (log server-side for debugging)
      console.warn("[login-context] Failed to load branch:", branchError.message);
    }

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
        recipient_type: recipient.recipient_type,
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

