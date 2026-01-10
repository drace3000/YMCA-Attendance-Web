import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CompletePasswordSetupRequest = {
  email: string;
};

export async function POST(req: NextRequest): Promise<Response> {
  try {
    let body: CompletePasswordSetupRequest;
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
      .select("id, is_active")
      .eq("email", email)
      .single();

    if (recipientError || !recipient) {
      const status = recipientError?.code === "PGRST116" ? 404 : 500;
      return await serverErrorResponse({
        req,
        status,
        errorType: "DB_ERROR",
        publicMessage: status === 404 ? "Account not found" : "Failed to complete password setup",
        logMessage: recipientError?.message ?? "Recipient not found",
        context: { module: "api.auth.complete_password_setup", action: "select_recipient", email },
        err: recipientError ?? null,
      });
    }

    if (recipient.is_active === false) {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("branch_schedule_recipients")
      .update({ needs_password_setup: false, last_login_at: nowIso })
      .eq("id", recipient.id);

    if (updateError) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: "Failed to update account status",
        logMessage: updateError.message,
        context: { module: "api.auth.complete_password_setup", action: "update_recipient", recipientId: recipient.id },
        err: updateError,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return await serverErrorResponse({
      req,
      errorType: "UNHANDLED_ERROR",
      publicMessage: "Internal server error",
      logMessage: err instanceof Error ? err.message : "Unknown error",
      context: { module: "api.auth.complete_password_setup", action: "unhandled" },
      err,
    });
  }
}

