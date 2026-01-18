import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/maintenance/classes/route";

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

let mockSupabaseClient: any;
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}));

function makeThenableQuery(result: { data: any; error: any }) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  const builder: any = {
    select: () => builder,
    order: () => builder,
    ilike: () => builder,
    neq: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return builder;
    },
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return { builder, eqCalls };
}

describe("Strict gate - /api/maintenance/classes branch scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Branch user ignores requested branch_id and is forced to their assigned branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    const { builder, eqCalls } = makeThenableQuery({ data: [], error: null });
    mockSupabaseClient = { from: () => builder };

    const req = new NextRequest(
      "http://localhost:3000/api/maintenance/classes?branch_id=br-other&program_group_id=pg-1",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual({ column: "branch_id", value: "br-allowed" });
    expect(eqCalls).toContainEqual({ column: "program_group_id", value: "pg-1" });
  });

  it("Admin uses requested branch_id when provided", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-fallback" },
    });

    const { builder, eqCalls } = makeThenableQuery({ data: [], error: null });
    mockSupabaseClient = { from: () => builder };

    const req = new NextRequest("http://localhost:3000/api/maintenance/classes?branch_id=br-selected");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual({ column: "branch_id", value: "br-selected" });
  });

  it("Admin falls back to access.branch_id when branch_id is omitted", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-fallback" },
    });

    const { builder, eqCalls } = makeThenableQuery({ data: [], error: null });
    mockSupabaseClient = { from: () => builder };

    const req = new NextRequest("http://localhost:3000/api/maintenance/classes");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual({ column: "branch_id", value: "br-fallback" });
  });

  it("returns 400 when branch_id is missing and no fallback branch exists", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: null },
    });

    mockSupabaseClient = { from: vi.fn() };

    const req = new NextRequest("http://localhost:3000/api/maintenance/classes");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(String(json.error)).toContain("branch_id");
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });

  it("check_name path is also branch-scoped", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-fallback" },
    });

    const { builder, eqCalls } = makeThenableQuery({ data: [], error: null });
    mockSupabaseClient = { from: () => builder };

    const req = new NextRequest(
      "http://localhost:3000/api/maintenance/classes?check_name=Yoga&branch_id=br-selected",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(eqCalls).toContainEqual({ column: "branch_id", value: "br-selected" });
  });
});


