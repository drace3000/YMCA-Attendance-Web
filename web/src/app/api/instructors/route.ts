import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

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

export async function GET(req: NextRequest): Promise<Response> {
  const required = await requireRecipientAccess(req, { allowDevPassthrough: true });
  if (!required.ok) return required.response;

  const supabase = createSupabaseServerClient();

  // Prefer a best-effort "display_name" composed in SQL via COALESCE-like behavior.
  // We can't use SQL functions directly in PostgREST select easily, so we select
  // relevant fields and compose in code.
  let query = supabase
    .from("instructors")
    .select("id,raw_name,first_name,last_name,nickname")
    .order("raw_name", { ascending: true });

  const access = required.access;
  if (access?.recipient_type === "Branch") {
    query = query.eq("branch_id", access.branch_id);
  }

  const { data, error } = await query;

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


