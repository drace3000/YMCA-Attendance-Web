import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";

type AllianceRow = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_type: "state" | "regional";
  headquarters_state_code: string | null;
  is_active: boolean;
};

type AssociationRow = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  alliance_id: string | null;
  state_code: string;
  region: string | null;
  is_active: boolean;
};

type BranchRow = {
  id: string;
  code: string;
  short_code: string | null;
  name: string;
  short_name: string | null;
  association_id: string;
  address: string | null;
  city: string | null;
  state_code: string | null;
  zip: string | null;
  phone: string | null;
  is_active: boolean;
  is_main_branch: boolean;
};

export async function GET(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("include_inactive") === "true";

    const supabase = createSupabaseServerClient();

    let alliancesQuery = supabase
      .from("ymca_alliances")
      .select("id, code, name, short_name, alliance_type, headquarters_state_code, is_active")
      .order("code", { ascending: true });
    if (!includeInactive) alliancesQuery = alliancesQuery.eq("is_active", true);

    let associationsQuery = supabase
      .from("ymca_associations")
      .select("id, code, name, short_name, alliance_id, state_code, region, is_active")
      .order("code", { ascending: true });
    if (!includeInactive) associationsQuery = associationsQuery.eq("is_active", true);

    let branchesQuery = supabase
      .from("ymca_branches")
      .select("id, code, short_code, name, short_name, association_id, address, city, state_code, zip, phone, is_active, is_main_branch")
      .order("name", { ascending: true });
    if (!includeInactive) branchesQuery = branchesQuery.eq("is_active", true);

    const [{ data: alliances, error: alliancesError }, { data: associations, error: associationsError }, { data: branches, error: branchesError }] =
      await Promise.all([alliancesQuery, associationsQuery, branchesQuery]);

    const firstError = alliancesError || associationsError || branchesError;
    if (firstError) {
      return await serverErrorResponse({
        req,
        errorType: "DB_ERROR",
        publicMessage: firstError.message,
        logMessage: firstError.message,
        context: {
          module: "api.maintenance.organization",
          criticality: "Medium",
          description: "Failed to query YMCA hierarchy tables for Maintenance → Organization.",
          includeInactive,
        },
        err: firstError,
      });
    }

    return NextResponse.json({
      alliances: (alliances ?? []) as AllianceRow[],
      associations: (associations ?? []) as AssociationRow[],
      branches: (branches ?? []) as BranchRow[],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return await serverErrorResponse({
      req,
      errorType: "API_ERROR",
      publicMessage: message,
      logMessage: message,
      context: {
        module: "api.maintenance.organization",
        criticality: "Medium",
        description: "Unhandled exception in Maintenance → Organization API route.",
      },
      err,
    });
  }
}

