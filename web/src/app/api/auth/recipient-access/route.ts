import { NextResponse, type NextRequest } from "next/server";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

type RecipientAccessResponse = {
  recipient: {
    id: string;
    email: string;
    recipient_type: "Administrator" | "Normal";
    is_active: boolean;
    needs_password_setup: boolean;
    last_login_at: string | null;
    branch_id: string;
    association_id: string | null;
    alliance_id: string | null;
  };
  branch: { id: string; name: string } | null;
};

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: false });
  if (!required.ok) return required.response;
  if (!required.access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const response: RecipientAccessResponse = {
    recipient: {
      id: "self",
      email: required.access.email,
      recipient_type: required.access.recipient_type,
      is_active: required.access.is_active,
      needs_password_setup: required.access.needs_password_setup,
      last_login_at: required.access.last_login_at,
      branch_id: required.access.branch_id,
      association_id: required.access.association_id,
      alliance_id: required.access.alliance_id,
    },
    branch: required.access.branch,
  };

  return NextResponse.json(response);
}

