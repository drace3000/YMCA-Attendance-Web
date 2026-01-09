import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

interface AllianceData {
  id: string;
  name: string;
  code: string;
}

interface AssociationData {
  id: string;
  name: string;
  code: string;
  alliance?: AllianceData | AllianceData[] | null;
}

interface BranchData {
  id: string;
  code: string;
  short_code: string | null;
  name: string;
  association?: AssociationData | AssociationData[] | null;
}

// GET - fetch branch with association/alliance names
export async function GET(_req: Request, context: Params): Promise<NextResponse> {
  const { id } = await context.params;
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("ymca_branches")
    .select(
      `
        id,
        code,
        short_code,
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
    console.error("Error fetching branch:", error.message);
    return NextResponse.json({ error: "Failed to fetch branch" }, { status: 500 });
  }

  const typedData = data as BranchData | null;
  const branchName = typedData?.name ?? null;
  const branchCode = typedData?.code ?? null;
  const branchShortCode = typedData?.short_code ?? null;
  
  // Handle association which could be object or array from Supabase
  const association = Array.isArray(typedData?.association) 
    ? typedData?.association[0] 
    : typedData?.association;
  
  const associationName = association?.name ?? null;
  const associationCode = association?.code ?? null;
  
  // Handle alliance which could be object or array from Supabase
  const alliance = Array.isArray(association?.alliance) 
    ? association?.alliance[0] 
    : association?.alliance;
  
  const allianceName = alliance?.name ?? null;
  const allianceCode = alliance?.code ?? null;

  return NextResponse.json({
    id,
    name: branchName,
    code: branchCode,
    short_code: branchShortCode,
    association_name: associationName,
    association_code: associationCode,
    alliance_name: allianceName,
    alliance_code: allianceCode,
  });
}

// PATCH - Update branch fields
export async function PATCH(req: Request, context: Params): Promise<NextResponse> {
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
    return NextResponse.json({ error: "Failed to update branch" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
