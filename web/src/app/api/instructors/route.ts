import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Instructor = {
  id: string;
  display_name: string;
};

type InstructorRow = {
  id: string;
  raw_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
};

export async function GET(): Promise<Response> {
  const supabase = createSupabaseServerClient();

  // Prefer a best-effort "display_name" composed in SQL via COALESCE-like behavior.
  // We can't use SQL functions directly in PostgREST select easily, so we select
  // relevant fields and compose in code.
  const { data, error } = await supabase
    .from("instructors")
    .select("id,raw_name,first_name,last_name,nickname")
    .order("raw_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      [{ id: "all", display_name: "All instructors" }],
      { status: 200 },
    );
  }

  const rows = (data ?? []) as unknown as InstructorRow[];
  const instructors = rows
    .map((r) => {
    const first = (r.first_name ?? "").toString().trim();
    const last = (r.last_name ?? "").toString().trim();
    const full = `${first} ${last}`.trim();
    const raw = (r.raw_name ?? "").toString().trim();
    const nick = (r.nickname ?? "").toString().trim();
    const display =
      nick || full || raw || (typeof r.id === "string" ? r.id : "Unknown");
    return { id: r.id, display_name: display } satisfies Instructor;
  })
  .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json(instructors);
}


