import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as APPROVE } from "@/app/api/scheduling/clone/approve/route";
import { POST as BACKOUT } from "@/app/api/scheduling/clone/backout/route";

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
      order: () => builder,
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

  return { from: (table: string) => makeBuilder(table) };
}

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

describe("/api/scheduling/clone approve/backout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approves an unapproved schedule", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    let updatePayload: any = null;
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action === "select") {
            return { data: { id: "sch-1", branch_id: "br-1", is_approved: false }, error: null };
          }
          if (state.action === "update") {
            updatePayload = state.payload;
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone/approve", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", schedule_id: "sch-1" }),
    });

    const res = await APPROVE(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(updatePayload).toMatchObject({ is_approved: true });
  });

  it("backs out (deletes) an unapproved cloned schedule and redirects to source", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          // Initial lookup of the schedule to backout
          const idEq = state.filters.find((f) => f.op === "eq" && f.column === "id")?.value;

          if (state.action === "select" && idEq === "sch-new") {
            return {
              data: {
                id: "sch-new",
                branch_id: "br-1",
                program_group_id: "pg-1",
                is_approved: false,
                cloned_from_id: "sch-src",
              },
              error: null,
            };
          }

          // Source schedule exists
          if (state.action === "select" && idEq === "sch-src") {
            return { data: { id: "sch-src" }, error: null };
          }

          if (state.action === "delete") {
            return { data: null, error: null };
          }

          // Fallback list (shouldn't be needed in this test)
          if (state.action === "select") {
            return { data: [{ id: "sch-fallback", month_start: "2025-12-01" }], error: null };
          }

          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone/backout", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1", schedule_id: "sch-new" }),
    });

    const res = await BACKOUT(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.deleted_schedule_id).toBe("sch-new");
    expect(json.redirect_schedule_id).toBe("sch-src");
  });
});

