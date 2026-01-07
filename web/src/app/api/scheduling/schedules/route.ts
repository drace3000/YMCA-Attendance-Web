import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

// GET - List all schedules
export async function GET() {
  const supabase = createSupabaseServerClient();

  const { data: schedules, error } = await supabase
    .from("schedules")
    .select("id, name, month_start, status, published_at, created_at")
    .order("month_start", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schedules: schedules || [] });
}
