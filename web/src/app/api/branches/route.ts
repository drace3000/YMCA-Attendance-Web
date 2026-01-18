import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const FALLBACK_EASTSIDE_BRANCH_ID = "26d6acb8-5acf-4a32-ac24-343f30b1442c";

interface AssociationData {
  id: string;
  code: string;
}

type Branch = {
  id: string;
  code: string;
  short_code?: string | null;
  name: string;
  association?: AssociationData | null;
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
  availability_time_start?: string | null; // "HH:mm" (or null in fallback)
  availability_time_end?: string | null; // "HH:mm" (or null in fallback)
};

interface RawBranchData {
  id: string;
  code: string;
  short_code?: string | null;
  name: string;
  association?: AssociationData | AssociationData[] | null;
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
  availability_time_start?: string | null;
  availability_time_end?: string | null;
}

function normalizeTimeToHm(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  // Accept HH:mm or HH:mm:ss (as returned by Postgres)
  const m = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function GET(): Promise<NextResponse> {
  const supabase = createSupabaseServerClient();
  
  // Fetch branches with all relevant fields for scheduling/reports
  const { data, error } = await supabase
    .from("ymca_branches")
    .select(
      "id, code, short_code, name, address, city, state, phone, website_url, schedule_email_from, schedule_email_reply_to, theme_color, branch_manager_name, branch_manager_email, branch_manager_phone, availability_time_start, availability_time_end, association:association_id (id, code)",
    )
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching branches:", error.message);
    // Return a UUID-based fallback so we never poison localStorage with non-UUID ids.
    // (Local dev restored DB uses this Eastside UUID.)
    const fallback: Branch = {
      id: FALLBACK_EASTSIDE_BRANCH_ID,
      code: "eastside_family_ymca",
      short_code: "EASTSIDE",
      name: "Eastside Family YMCA",
      association: null,
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
      availability_time_start: "06:00",
      availability_time_end: "23:00",
    };
    return NextResponse.json([fallback], { status: 200 });
  }

  // Transform raw data to handle Supabase returning association as array
  const rawData = (data ?? []) as RawBranchData[];
  const branches: Branch[] = rawData.map((b) => ({
    ...b,
    association: Array.isArray(b.association) ? b.association[0] ?? null : b.association ?? null,
    availability_time_start: normalizeTimeToHm(b.availability_time_start),
    availability_time_end: normalizeTimeToHm(b.availability_time_end),
  }));
  
  return NextResponse.json(branches);
}

