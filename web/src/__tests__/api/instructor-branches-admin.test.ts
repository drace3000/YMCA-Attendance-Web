import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, PUT } from "@/app/api/maintenance/instructors/[id]/branches/route";

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: unknown;
  filters: Array<{ op: "eq" | "ilike" | "neq" | "in"; column: string; value: unknown }>;
  wantSingle: boolean;
  options?: unknown;
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
      limit: () => builder,
      insert: (payload: unknown) => {
        state.action = "insert";
        state.payload = payload;
        return builder;
      },
      upsert: (payload: unknown, options?: unknown) => {
        state.action = "upsert";
        state.payload = payload;
        state.options = options;
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
    let icldUpsertPayload: any[] | null = null;
    let branchSelectCount = 0;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructors: async (state) => {
          expect(state.action).toBe("select");
          const isSingleByIdLookup =
            state.wantSingle &&
            state.filters.some((f) => f.op === "eq" && f.column === "id" && f.value === instructorId);
          if (isSingleByIdLookup) {
            return {
              data: {
                id: instructorId,
                branch_id: homeBranchId,
                nickname: "CASEY",
                first_name: null,
                last_name: null,
              },
              error: null,
            };
          }

          const isPlaceholderLookup =
            state.filters.some((f) => f.op === "ilike" && f.column === "nickname" && f.value === "UNASSIGNED") &&
            state.filters.some((f) => f.op === "eq" && f.column === "branch_id" && f.value === sharedBranchId);
          if (isPlaceholderLookup) {
            return { data: [{ id: "ph-1", nickname: "UNASSIGNED" }], error: null };
          }

          // Any other selects in this test return empty set.
          return { data: [], error: null };
        },
        ymca_branches: async (state) => {
          expect(state.action).toBe("select");
          // should validate both home + shared
          const inFilter = state.filters.find((f) => f.op === "in" && f.column === "id");
          expect(Array.isArray(inFilter?.value)).toBe(true);
          return { data: [{ id: homeBranchId }, { id: sharedBranchId }], error: null };
        },
        instructor_branches: async (state) => {
          if (state.action === "select") {
            branchSelectCount += 1;
            if (branchSelectCount === 1) {
              // existing links (before replacement): ensure home only
              return { data: [{ branch_id: homeBranchId, is_primary: true }], error: null };
            }

            // final select (after replacement)
            return {
              data: [
                { branch_id: homeBranchId, is_primary: true },
                { branch_id: sharedBranchId, is_primary: false },
              ],
              error: null,
            };
          }
          if (state.action === "delete") {
            deleted = true;
            return { data: null, error: null };
          }
          if (state.action === "insert") {
            insertedPayload = state.payload as any[];
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        // Auto-backfill calls
        instructor_class_location_details: async (state) => {
          if (state.action === "select") {
            // placeholder lookup pairs should query placeholder in shared branch
            return {
              data: [
                {
                  class_id: "c1",
                  class_name: "ACTIVE YOGA",
                  location_id: "l1",
                  location_name: "Studio",
                  minutes: 60,
                },
              ],
              error: null,
            };
          }
          if (state.action === "upsert") {
            icldUpsertPayload = state.payload as any[];
            expect(state.options).toEqual({
              onConflict: "branch_id,instructor_id,class_id,location_id,minutes",
              ignoreDuplicates: true,
            });
            return { data: [], error: null };
          }
          return { data: [], error: null };
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

    // ICLD backfill should have happened for the newly-added shared branch.
    expect(Array.isArray(icldUpsertPayload)).toBe(true);
    expect(icldUpsertPayload?.[0]).toMatchObject({
      branch_id: sharedBranchId,
      instructor_id: instructorId,
      class_id: "c1",
      location_id: "l1",
      minutes: 60,
      source_file: "auto_backfill_from_class_level_unassigned",
    });
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


