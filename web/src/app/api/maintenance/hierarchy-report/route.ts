import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type Alliance = {
  id: string;
  code: string;
  name: string;
  alliance_type: "state" | "regional";
  headquarters_state_code: string | null;
  is_active: boolean;
};

type Association = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_id: string | null;
  state_code: string;
  region: string | null;
  is_active: boolean;
};

type Branch = {
  id: string;
  code: string;
  short_code: string | null;
  name: string;
  short_name: string | null;
  association_id: string;
  city: string | null;
  state_code: string | null;
  zip: string | null;
  phone: string | null;
  is_active: boolean;
  is_main_branch: boolean;
};

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const [{ data: alliances, error: aErr }, { data: associations, error: asErr }, { data: branches, error: bErr }] =
      await Promise.all([
        supabase
          .from("ymca_alliances")
          .select("id, code, name, alliance_type, headquarters_state_code, is_active")
          .order("code"),
        supabase
          .from("ymca_associations")
          .select("id, code, name, short_name, alliance_id, state_code, region, is_active")
          .order("code"),
        supabase
          .from("ymca_branches")
          .select("id, code, short_code, name, short_name, association_id, city, state_code, zip, phone, is_active, is_main_branch")
          .order("code"),
      ]);

    const firstError = aErr || asErr || bErr;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    return NextResponse.json({
      alliances: (alliances ?? []) as Alliance[],
      associations: (associations ?? []) as Association[],
      branches: (branches ?? []) as Branch[],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
