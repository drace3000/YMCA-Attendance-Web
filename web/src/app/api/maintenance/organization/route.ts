import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

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

function generateErrorCode(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

async function logServerErrorToApi(params: {
  req: Request;
  message: string;
  errorType: string;
  context: Record<string, unknown>;
  stack?: string | null;
}): Promise<void> {
  const { req, message, errorType, context, stack } = params;
  try {
    const origin = new URL(req.url).origin;
    const url = new URL("/api/errors/log", origin).toString();

    const secret = process.env.ERROR_LOG_SECRET || process.env.CRON_SECRET || "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["x-error-log-secret"] = secret;

    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        error_code: generateErrorCode(),
        error_type: errorType,
        message,
        context,
        stack_trace: stack ?? null,
        source: "server",
        url: req.url,
        user_agent: req.headers.get("user-agent"),
      }),
    });
  } catch {
    // Never throw from error logging to avoid cascading failures.
  }
}

export async function GET(req: Request) {
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
      await logServerErrorToApi({
        req,
        message: firstError.message,
        errorType: "DB_ERROR",
        context: {
          module: "api.maintenance.organization",
          criticality: "Medium",
          description: "Failed to query YMCA hierarchy tables for Maintenance → Organization.",
          includeInactive,
        },
        stack: null,
      });
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    return NextResponse.json({
      alliances: (alliances ?? []) as AllianceRow[],
      associations: (associations ?? []) as AssociationRow[],
      branches: (branches ?? []) as BranchRow[],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    await logServerErrorToApi({
      req,
      message,
      errorType: "API_ERROR",
      context: {
        module: "api.maintenance.organization",
        criticality: "Medium",
        description: "Unhandled exception in Maintenance → Organization API route.",
      },
      stack: err instanceof Error ? err.stack ?? null : null,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

