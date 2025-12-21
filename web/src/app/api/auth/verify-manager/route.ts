import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type VerifyManagerPayload = {
  email: string;
};

type RegisterManagerPayload = {
  email: string;
  branch_id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
};

// GET - Check if email is a branch manager
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  // Check if this email is a branch manager
  const { data: branch, error } = await supabase
    .from("branches")
    .select("id, name, branch_manager_email, branch_manager_name")
    .ilike("branch_manager_email", email.trim())
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows returned
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (branch) {
    return NextResponse.json({
      isManager: true,
      branch: {
        id: branch.id,
        name: branch.name,
        manager_name: branch.branch_manager_name,
      },
    });
  }

  return NextResponse.json({ isManager: false, branch: null });
}

// POST - Register as a new branch manager
export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();

  let body: RegisterManagerPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, branch_id, first_name, last_name, phone } = body;

  if (!email?.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  if (!branch_id) {
    return NextResponse.json({ error: "branch_id is required" }, { status: 400 });
  }

  // Check if branch exists
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id, name, branch_manager_email")
    .eq("id", branch_id)
    .single();

  if (branchError || !branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  // Check if branch already has a manager
  if (branch.branch_manager_email) {
    return NextResponse.json(
      { error: "This branch already has a manager assigned" },
      { status: 409 }
    );
  }

  // Check if this email is already a manager of another branch
  const { data: existingManager } = await supabase
    .from("branches")
    .select("id, name")
    .ilike("branch_manager_email", email.trim())
    .single();

  if (existingManager) {
    return NextResponse.json(
      { error: `This email is already managing ${existingManager.name}` },
      { status: 409 }
    );
  }

  // Build manager name
  const managerName = [first_name?.trim(), last_name?.trim()]
    .filter(Boolean)
    .join(" ") || null;

  // Update branch with manager info
  const { error: updateError } = await supabase
    .from("branches")
    .update({
      branch_manager_email: email.trim().toLowerCase(),
      branch_manager_name: managerName,
      branch_manager_phone: phone?.trim() || null,
    })
    .eq("id", branch_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    branch: {
      id: branch.id,
      name: branch.name,
    },
  });
}


