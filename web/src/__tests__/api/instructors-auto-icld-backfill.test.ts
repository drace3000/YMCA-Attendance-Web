import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/maintenance/instructors/route";

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "upsert";
  filters: Array<{ op: "eq" | "ilike"; column: string; value: unknown }>;
  payload?: unknown;
  options?: unknown;
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
      limit: () => builder,
      single: () => {
        state.wantSingle = true;
        return builder;
      },
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
      eq: (column: string, value: unknown) => {
        state.filters.push({ op: "eq", column, value });
        return builder;
      },
      ilike: (column: string, value: unknown) => {
        state.filters.push({ op: "ilike", column, value });
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

describe("POST /api/maintenance/instructors auto-backfills ICLD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRecipientAccess.mockResolvedValue({
      ok: true,
      response: null,
      access: { recipient_type: "Administrator", branch_id: "br-admin" },
    });
  });

  it("creates instructor and upserts ICLD rows from class-level UNASSIGNED pairs", async () => {
    const branchId = "br-1";

    let upsertedIcldRows: any[] | null = null;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        // nickname uniqueness check + readable id generation + placeholder lookup
        instructors: async (state) => {
          if (state.action === "select") {
            // nickname uniqueness check for new instructor
            const isNickCheck =
              state.filters.some((f) => f.op === "ilike" && f.column === "nickname" && f.value === "CASEY") &&
              state.filters.some((f) => f.op === "eq" && f.column === "branch_id" && f.value === branchId);
            if (isNickCheck) return { data: [], error: null };

            // getNextReadableId for new instructor
            const isReadableIdCheck = state.filters.some(
              (f) => f.op === "ilike" && f.column === "readable_id" && String(f.value).startsWith("AS-BR-CASEY"),
            );
            if (isReadableIdCheck) return { data: [], error: null };

            // placeholder lookup for UNASSIGNED
            const isPlaceholderLookup =
              state.filters.some((f) => f.op === "ilike" && f.column === "nickname" && f.value === "UNASSIGNED") &&
              state.filters.some((f) => f.op === "eq" && f.column === "branch_id" && f.value === branchId);
            if (isPlaceholderLookup) return { data: [{ id: "ph-1", nickname: "UNASSIGNED" }], error: null };

            return { data: [], error: null };
          }

          if (state.action === "insert") {
            // instructor create
            expect(state.payload).toMatchObject({
              nickname: "CASEY",
              branch_id: branchId,
              is_active: true,
            });
            return {
              data: { id: "inst-new", nickname: "CASEY", first_name: "Casey", last_name: "Jones" },
              error: null,
            };
          }

          return { data: null, error: null };
        },

        ymca_branches: async (state) => {
          expect(state.action).toBe("select");
          // Branch meta lookup for new instructor readable_id generation
          return { data: { id: branchId, short_code: "BR", association: { code: "AS" } }, error: null };
        },

        instructor_branches: async (state) => {
          // called for the primary link upsert; we don't assert specifics here
          return { data: null, error: null };
        },

        instructor_class_location_details: async (state) => {
          if (state.action === "select") {
            // class-level pairs for placeholder
            expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: branchId });
            expect(state.filters).toContainEqual({ op: "eq", column: "instructor_id", value: "ph-1" });
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
            upsertedIcldRows = state.payload as any[];
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

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors", {
      method: "POST",
      body: JSON.stringify({
        branch_id: branchId,
        first_name: "Casey",
        last_name: "Jones",
        nickname: "CASEY",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(Array.isArray(upsertedIcldRows)).toBe(true);
    expect(upsertedIcldRows).toHaveLength(1);
    expect(upsertedIcldRows?.[0]).toMatchObject({
      branch_id: branchId,
      instructor_id: "inst-new",
      class_id: "c1",
      location_id: "l1",
      minutes: 60,
      source_file: "auto_backfill_from_class_level_unassigned",
    });
  });
});

