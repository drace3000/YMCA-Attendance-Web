import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

// PATCH - Update branch fields
export async function PATCH(req: Request, context: Params) {
  const { id } = await context.params;
  
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Only allow updating specific fields
  const allowedFields = [
    "branch_manager_name",
    "branch_manager_email", 
    "branch_manager_phone",
    "website_url",
    "schedule_email_from",
    "schedule_email_reply_to",
    "theme_color",
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await supabase
    .from("branches")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Error updating branch:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
