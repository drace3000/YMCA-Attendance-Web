import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const FALLBACK_EASTSIDE_BRANCH_ID = "26d6acb8-5acf-4a32-ac24-343f30b1442c";

type Branch = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  website_url?: string | null;
  schedule_email_from?: string | null;
  schedule_email_reply_to?: string | null;
  theme_color?: string | null;
  branch_manager_name?: string | null;
  branch_manager_email?: string | null;
  branch_manager_phone?: string | null;
};

export async function GET() {
  const supabase = createSupabaseServerClient();
  
  // Fetch branches with all relevant fields for scheduling/reports
  const { data, error } = await supabase
    .from("ymca_branches")
    .select(
      "id, name, address, city, state, phone, website_url, schedule_email_from, schedule_email_reply_to, theme_color, branch_manager_name, branch_manager_email, branch_manager_phone",
    )
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching branches:", error.message);
    // Return a UUID-based fallback so we never poison localStorage with non-UUID ids.
    // (Local dev restored DB uses this Eastside UUID.)
    const fallback: Branch = {
      id: FALLBACK_EASTSIDE_BRANCH_ID,
      name: "Eastside Family YMCA",
      theme_color: "#01A490",
      address: null,
      city: null,
      state: null,
      phone: null,
      website_url: null,
      schedule_email_from: null,
      schedule_email_reply_to: null,
      branch_manager_name: null,
      branch_manager_email: null,
      branch_manager_phone: null,
    };
    return NextResponse.json([fallback], { status: 200 });
  }

  const branches: Branch[] = data ?? [];
  return NextResponse.json(branches);
}

