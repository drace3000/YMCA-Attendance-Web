import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST, PUT } from "@/app/api/scheduling/sessions/route";

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  filters: Array<{ op: "eq" | "ilike" | "neq" | "in" | "is" | "gt"; column: string; value: unknown }>;
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
      is: (column: string, value: unknown) => {
        state.filters.push({ op: "is", column, value });
        return builder;
      },
      gt: (column: string, value: unknown) => {
        state.filters.push({ op: "gt", column, value });
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

describe("Phase X - /api/scheduling/sessions instructor-branch validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRecipientAccess.mockResolvedValue({
      ok: true,
      response: null,
      access: {
        recipient_type: "Administrator",
        branch_id: "br-admin",
        association_id: "as-admin",
        alliance_id: "al-admin",
      },
    });
  });

  it("POST returns 409 when an instructor is not available for the branch", async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        classes: async () => ({ data: { id: "cls-1" }, error: null }),
        locations: async () => ({ data: { id: "loc-1" }, error: null }),
        instructors: async () => ({
          // Instructor exists but is owned by a different branch
          data: [{ id: "inst-ok", branch_id: "br-999" }],
          error: null,
        }),
        instructor_branches: async () => ({ data: [], error: null }),
        class_sessions: async () => {
          throw new Error("should not insert session when instructor validation fails");
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "09:00",
        end_time: "10:00",
        session_date: "2026-01-01",
        instructor_ids: ["inst-bad"],
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("instructor");
  });

  it("PUT returns 409 when updated instructor list includes out-of-scope instructor", async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        // Current session prefetch (single)
        class_sessions: async (state) => {
          if (state.action === "select" && state.wantSingle) {
            return {
              data: {
                id: "sess-1",
                branch_id: "br-1",
                schedule_id: "sch-1",
                day_of_week: "THURSDAY",
                start_time: "08:00",
                end_time: "09:00",
                session_date: "2026-01-01",
                location_id: "loc-1",
              },
              error: null,
            };
          }
          if (state.action === "select") {
            // "other sessions on date" for conflict preflight
            return { data: [], error: null };
          }
          if (state.action === "update") {
            // No field updates are expected for instructor-only PUT
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        instructors: async () => ({ data: [], error: null }),
        instructor_branches: async () => ({ data: [], error: null }),
        session_instructors: async (state) => {
          if (state.action === "delete" || state.action === "insert") {
            throw new Error("should not modify instructor links when validation fails");
          }
          return { data: [], error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "PUT",
      body: JSON.stringify({
        id: "sess-1",
        instructor_ids: ["inst-bad"],
      }),
    });

    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("instructor");
  });
});

