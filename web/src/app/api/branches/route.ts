import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Branch = { id: string; name: string; theme_color?: string | null };

export async function GET() {
  const supabase = createSupabaseServerClient();
  // Try to include theme_color if the column exists; otherwise fall back to id/name.
  const first = await supabase
    .from("branches")
    .select("id,name,theme_color")
    .order("name", { ascending: true });
  const { data, error } =
    first.error && /theme_color/i.test(first.error.message)
      ? await supabase.from("branches").select("id,name").order("name", { ascending: true })
      : first;

  if (error) {
    return NextResponse.json(
      [
        { id: "eastside", name: "Eastside Family YMCA", theme_color: "#01A490" },
        { id: "placeholder", name: "Branch list unavailable" },
      ],
      { status: 200 },
    );
  }

  const branches: Branch[] = data ?? [];
  return NextResponse.json(branches);
}

