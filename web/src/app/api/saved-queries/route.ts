import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

interface SavedQuery {
  id: string;
  branch_id: string;
  name: string;
  query_text: string;
  created_at: string;
}

// GET - Fetch all saved queries for a branch
export async function GET(request: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(request, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(request.url);
  const requestedBranchId = searchParams.get("branch_id");
  const access = required.access;
  const branchId =
    access?.recipient_type === "Branch" && access ? access.branch_id : requestedBranchId;

  if (!branchId) {
    return NextResponse.json(
      { error: "branch_id is required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseServerClient();
    
    const { data, error } = await supabase
      .from("saved_queries")
      .select("id, branch_id, name, query_text, created_at")
      .eq("branch_id", branchId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as SavedQuery[]);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch saved queries" },
      { status: 500 }
    );
  }
}

// POST - Save a new query
export async function POST(request: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(request, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  try {
    const body = await request.json();
    const { branchId, name, queryText } = body;

    if (!branchId || !name || !queryText) {
      return NextResponse.json(
        { error: "branchId, name, and queryText are required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return NextResponse.json(
        { error: "Name cannot be empty" },
        { status: 400 }
      );
    }

    if (trimmedName.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or less" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const resolvedBranchId =
      required.access?.recipient_type === "Branch" && required.access
        ? required.access.branch_id
        : branchId;

    const { data, error } = await supabase
      .from("saved_queries")
      .insert({
        branch_id: resolvedBranchId,
        name: trimmedName,
        query_text: queryText.trim(),
      })
      .select()
      .single();

    if (error) {
      // Check for unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A query with this name already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as SavedQuery);
  } catch {
    return NextResponse.json(
      { error: "Failed to save query" },
      { status: 500 }
    );
  }
}

// PUT - Update an existing query
export async function PUT(request: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(request, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  try {
    const body = await request.json();
    const { id, queryText } = body;

    if (!id || !queryText) {
      return NextResponse.json(
        { error: "id and queryText are required" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const access = required.access;

    let query = supabase
      .from("saved_queries")
      .update({ query_text: queryText.trim() })
      .eq("id", id);

    if (access?.recipient_type === "Branch") {
      query = query.eq("branch_id", access.branch_id);
    }

    const { data, error } = await query.select().single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as SavedQuery);
  } catch {
    return NextResponse.json(
      { error: "Failed to update query" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a saved query
export async function DELETE(request: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(request, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseServerClient();
    const access = required.access;

    let query = supabase
      .from("saved_queries")
      .delete()
      .eq("id", id);

    if (access?.recipient_type === "Branch") {
      query = query.eq("branch_id", access.branch_id);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete query" },
      { status: 500 }
    );
  }
}


