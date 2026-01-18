import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, PUT } from "@/app/api/maintenance/instructors/[id]/branches/route";

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Array<{ op: "eq" | "ilike" | "neq" | "in"; column: string; value: unknown }>;
  wantSingle: boolean;
};

type MockHandlerResult = { data: any; error: any };
type MockTableHandler = (state: MockQueryState) => Promise<MockHandlerResult> | MockHandlerResult;

function createMockSupabaseClient(handlers: Record<string, MockTableHandler>) {
  function makeBuilder(table: string) {
    const state: MockQueryState = {
      table,
      action: "select",
      filters: [],
      wantSingle: false,
    };

    const builder: any = {
      select: () => builder,
      returns: () => builder,
      insert: (payload: unknown) => {
        state.action = "insert";
        state.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        state.action = "update";
        state.payload = payload;
        return builder;
      },
      delete: () => {
        state.action = "delete";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.filters.push({ op: "eq", column, value });
        return builder;
      },
      ilike: (column: string, value: unknown) => {
        state.filters.push({ op: "ilike", column, value });
        return builder;
      },
      neq: (column: string, value: unknown) => {
        state.filters.push({ op: "neq", column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push({ op: "in", column, value });
        return builder;
      },
      single: () => {
        state.wantSingle = true;
        return builder;
      },
      maybeSingle: () => {
        state.wantSingle = true;
        return builder;
      },
      then: (resolve: any, reject: any) => {
        const handler = handlers[table];
        const result = handler ? handler(state) : { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };

    return builder;
  }

  return {
    from: (table: string) => makeBuilder(table),
  };
}

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

describe("Admin-only instructor sharing - /api/maintenance/instructors/[id]/branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 403 for Branch users", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors/inst-1/branches");
    const res = await GET(req, { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) });
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(String(json.error)).toContain("Forbidden");
  });

  it("PUT replaces branch links and preserves home branch as primary", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-admin" },
    });

    const instructorId = "11111111-1111-1111-1111-111111111111";
    const homeBranchId = "22222222-2222-2222-2222-222222222222";
    const sharedBranchId = "33333333-3333-3333-3333-333333333333";

    let deleted = false;
    let insertedPayload: any[] | null = null;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructors: async (state) => {
          expect(state.action).toBe("select");
          return { data: { id: instructorId, branch_id: homeBranchId }, error: null };
        },
        ymca_branches: async (state) => {
          expect(state.action).toBe("select");
          // should validate both home + shared
          const inFilter = state.filters.find((f) => f.op === "in" && f.column === "id");
          expect(Array.isArray(inFilter?.value)).toBe(true);
          return { data: [{ id: homeBranchId }, { id: sharedBranchId }], error: null };
        },
        instructor_branches: async (state) => {
          if (state.action === "delete") {
            deleted = true;
            return { data: null, error: null };
          }
          if (state.action === "insert") {
            insertedPayload = state.payload as any[];
            return { data: null, error: null };
          }
          // final select
          return {
            data: [
              { branch_id: homeBranchId, is_primary: true },
              { branch_id: sharedBranchId, is_primary: false },
            ],
            error: null,
          };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors/x/branches", {
      method: "PUT",
      body: JSON.stringify({ branch_ids: [sharedBranchId] }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: instructorId }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(deleted).toBe(true);
    expect(Array.isArray(insertedPayload)).toBe(true);
    expect(insertedPayload?.some((r) => r.branch_id === homeBranchId && r.is_primary === true)).toBe(true);
    expect(insertedPayload?.some((r) => r.branch_id === sharedBranchId && r.is_primary === false)).toBe(true);
    expect(json).toEqual([
      { branch_id: homeBranchId, is_primary: true },
      { branch_id: sharedBranchId, is_primary: false },
    ]);
  });

  it("PUT returns 400 when a branch_id does not exist", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-admin" },
    });

    const instructorId = "11111111-1111-1111-1111-111111111111";
    const homeBranchId = "22222222-2222-2222-2222-222222222222";
    const badBranchId = "33333333-3333-3333-3333-333333333333";

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructors: async () => ({ data: { id: instructorId, branch_id: homeBranchId }, error: null }),
        ymca_branches: async () => ({ data: [{ id: homeBranchId }], error: null }), // missing badBranchId
        instructor_branches: async () => {
          throw new Error("should not delete/insert when validation fails");
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors/x/branches", {
      method: "PUT",
      body: JSON.stringify({ branch_ids: [badBranchId] }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: instructorId }) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(String(json.error)).toContain("invalid");
    expect(json.missing_branch_ids).toEqual([badBranchId]);
  });
});


