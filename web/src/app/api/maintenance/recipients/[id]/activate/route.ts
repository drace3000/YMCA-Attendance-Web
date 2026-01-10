import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;
  if (required.access?.recipient_type === "Normal") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid recipient id format" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { error } = await supabase
    .from("branch_schedule_recipients")
    .update({ is_active: true })
    .eq("id", id);

  if (error) {
    return await serverErrorResponse({
      req,
      errorType: "DB_ERROR",
      publicMessage: error.message,
      logMessage: error.message,
      context: { module: "api.maintenance.recipients.activate", action: "update_recipient" },
      err: error,
    });
  }

  return NextResponse.json({ success: true });
}

