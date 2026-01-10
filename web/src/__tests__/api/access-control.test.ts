import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { GET as getSchedules } from "@/app/api/scheduling/schedules/route";
import { GET as getReports } from "@/app/api/reports/route";

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

function makeThenableQueryBuilder(result: { data: any; error: any }) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  const builder: any = {
    select: () => builder,
    order: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return builder;
    },
    gte: () => builder,
    lt: () => builder,
    ilike: () => builder,
    range: async () => result,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return { builder, eqCalls };
}

describe("Phase 9 - API access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated (schedules)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });

    const req = new NextRequest("http://localhost:3000/api/scheduling/schedules?branch_id=x");
    const res = await getSchedules(req);
    expect(res.status).toBe(401);
  });

  it("forces Normal users to their branch_id (schedules)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: {
        email: "manager@ymca.org",
        recipient_type: "Normal",
        is_active: true,
        needs_password_setup: false,
        last_login_at: null,
        branch_id: "br-allowed",
        branch: { id: "br-allowed", name: "Allowed Branch" },
        association_id: null,
        alliance_id: null,
      },
    });

    const { builder, eqCalls } = makeThenableQueryBuilder({ data: [], error: null });
    mockCreateSupabaseServerClient.mockReturnValue({
      from: () => builder,
    });

    const req = new NextRequest("http://localhost:3000/api/scheduling/schedules?branch_id=br-other");
    const res = await getSchedules(req);
    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual({ column: "branch_id", value: "br-allowed" });
  });

  it("scopes report queries to branch_id for Normal users (reports)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: {
        email: "manager@ymca.org",
        recipient_type: "Normal",
        is_active: true,
        needs_password_setup: false,
        last_login_at: null,
        branch_id: "br-allowed",
        branch: { id: "br-allowed", name: "Allowed Branch" },
        association_id: null,
        alliance_id: null,
      },
    });

    const builders: Array<ReturnType<typeof makeThenableQueryBuilder>> = [];
    mockCreateSupabaseServerClient.mockReturnValue({
      from: () => {
        const b = makeThenableQueryBuilder({ data: [], error: null });
        builders.push(b);
        return b.builder;
      },
    });

    const req = new NextRequest("http://localhost:3000/api/reports?year=2025&month=all&quarter=all&week=all&day=all&instructor=all");
    const res = await getReports(req);
    expect(res.status).toBe(200);

    const allEqCalls = builders.flatMap((b) => b.eqCalls);
    expect(allEqCalls).toContainEqual({ column: "branch_id", value: "br-allowed" });
  });
});

