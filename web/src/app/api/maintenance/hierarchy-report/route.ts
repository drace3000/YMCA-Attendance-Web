import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { serverErrorResponse } from "@/lib/server-api-error";

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
  address: string | null;
  city: string | null;
  state_code: string | null;
  zip: string | null;
  phone: string | null;
  is_active: boolean;
  is_main_branch: boolean;
};

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const supabase = createSupabaseServerClient();

    const searchParams = request.nextUrl.searchParams;
    const selectedAllianceId = searchParams.get("alliance_id");
    const selectedAssociationId = searchParams.get("association_id");
    const includeInactive = searchParams.get("include_inactive") === "true";

    if (!selectedAllianceId || !selectedAssociationId) {
      return NextResponse.json(
        { error: "Missing required parameters: alliance_id and association_id" },
        { status: 400 }
      );
    }

    // Fetch the association first (so we can validate linkage + apply the correct alliance)
    let associationQuery = supabase
      .from("ymca_associations")
      .select("id, code, name, short_name, alliance_id, state_code, region, is_active")
      .eq("id", selectedAssociationId)
      .limit(1);

    if (!includeInactive) {
      associationQuery = associationQuery.eq("is_active", true);
    }

    const { data: associationRows, error: assocErr } = await associationQuery;
    if (assocErr) {
      return await serverErrorResponse({
        req: request,
        errorType: "DB_ERROR",
        publicMessage: assocErr.message,
        logMessage: assocErr.message,
        context: { module: "api.maintenance.hierarchy-report", action: "select_association" },
        err: assocErr,
      });
    }
    const association = (associationRows ?? [])[0] as Association | undefined;

    if (!association) {
      return NextResponse.json(
        { error: "Selected association not found (or inactive)" },
        { status: 404 }
      );
    }

    if (association.alliance_id && association.alliance_id !== selectedAllianceId) {
      return NextResponse.json(
        { error: "Selected association does not belong to selected alliance" },
        { status: 400 }
      );
    }

    // Fetch the alliance (must match the selected alliance id)
    let allianceQuery = supabase
      .from("ymca_alliances")
      .select("id, code, name, alliance_type, headquarters_state_code, is_active")
      .eq("id", selectedAllianceId)
      .limit(1);

    if (!includeInactive) {
      allianceQuery = allianceQuery.eq("is_active", true);
    }

    const { data: allianceRows, error: allianceErr } = await allianceQuery;
    if (allianceErr) {
      return await serverErrorResponse({
        req: request,
        errorType: "DB_ERROR",
        publicMessage: allianceErr.message,
        logMessage: allianceErr.message,
        context: { module: "api.maintenance.hierarchy-report", action: "select_alliance" },
        err: allianceErr,
      });
    }
    const alliance = (allianceRows ?? [])[0] as Alliance | undefined;

    if (!alliance) {
      return NextResponse.json(
        { error: "Selected alliance not found (or inactive)" },
        { status: 404 }
      );
    }

    // Fetch branches for the selected association
    let branchesQuery = supabase
      .from("ymca_branches")
      .select(
        "id, code, short_code, name, short_name, association_id, address, city, state_code, zip, phone, is_active, is_main_branch"
      )
      .eq("association_id", selectedAssociationId)
      .order("code");

    if (!includeInactive) {
      branchesQuery = branchesQuery.eq("is_active", true);
    }

    const { data: branchRows, error: branchErr } = await branchesQuery;
    if (branchErr) {
      return await serverErrorResponse({
        req: request,
        errorType: "DB_ERROR",
        publicMessage: branchErr.message,
        logMessage: branchErr.message,
        context: { module: "api.maintenance.hierarchy-report", action: "select_branches" },
        err: branchErr,
      });
    }

    const alliances = [alliance] as Alliance[];
    const associations = [association] as Association[];
    const branches = (branchRows ?? []) as Branch[];

    return NextResponse.json({
      alliances,
      associations,
      branches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return await serverErrorResponse({
      req: request,
      errorType: "API_ERROR",
      publicMessage: message,
      logMessage: message,
      context: { module: "api.maintenance.hierarchy-report", action: "unhandled_exception" },
      err,
    });
  }
}
