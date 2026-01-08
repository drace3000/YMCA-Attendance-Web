import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

// GET - fetch branch with association/alliance names
export async function GET(_req: Request, context: Params) {
  const { id } = await context.params;
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("ymca_branches")
    .select(
      `
        id,
        name,
        association:association_id (
          id,
          name,
          code,
          alliance:alliance_id (
            id,
            name,
            code
          )
        )
      `
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const branchName = data?.name ?? null;
  const associationName = data?.association?.name ?? null;
  const associationCode = data?.association?.code ?? null;
  const allianceName = data?.association?.alliance?.name ?? null;
  const allianceCode = data?.association?.alliance?.code ?? null;

  return NextResponse.json({
    id,
    name: branchName,
    association_name: associationName,
    association_code: associationCode,
    alliance_name: allianceName,
    alliance_code: allianceCode,
  });
}

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
    .from("ymca_branches")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Error updating branch:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
