import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface SavedQuery {
  id: string;
  branch_id: string;
  name: string;
  query_text: string;
  created_at: string;
}

// GET - Fetch all saved queries for a branch
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branch_id");

  if (!branchId) {
    return NextResponse.json(
      { error: "branch_id is required" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from("saved_queries")
      .select("*")
      .eq("branch_id", branchId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching saved queries:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as SavedQuery[]);
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to fetch saved queries" },
      { status: 500 }
    );
  }
}

// POST - Save a new query
export async function POST(request: Request) {
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

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("saved_queries")
      .insert({
        branch_id: branchId,
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
      console.error("Error saving query:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as SavedQuery);
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to save query" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a saved query
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("saved_queries")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting query:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to delete query" },
      { status: 500 }
    );
  }
}

