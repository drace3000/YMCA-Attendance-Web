import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/scheduling/sessions/route";

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

describe("Smart Scheduler strict gate - /api/scheduling/sessions POST branch safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when schedule_id is not available for the branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          expect(state.action).toBe("select");
          expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: "br-1" });
          return { data: null, error: null };
        },
        classes: async () => {
          throw new Error("should not validate class when schedule validation fails");
        },
        locations: async () => {
          throw new Error("should not validate location when schedule validation fails");
        },
        class_sessions: async () => {
          throw new Error("should not insert session when schedule validation fails");
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        schedule_id: "sch-bad",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "monday",
        start_time: "08:00",
        end_time: "09:00",
        session_date: "2026-01-01",
        instructor_ids: [],
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json).toEqual({ error: "Selected schedule is not available for this branch" });
  });

  it("rejects when class_id is not available for the branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1" }, error: null }),
        classes: async (state) => {
          expect(state.action).toBe("select");
          expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: "br-1" });
          return { data: null, error: null };
        },
        locations: async () => {
          throw new Error("should not validate location when class validation fails");
        },
        class_sessions: async () => {
          throw new Error("should not insert session when class validation fails");
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-bad",
        location_id: "loc-1",
        day_of_week: "monday",
        start_time: "08:00",
        end_time: "09:00",
        session_date: "2026-01-01",
        instructor_ids: [],
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json).toEqual({ error: "Selected class is not available for this branch" });
  });

  it("allows cross-branch instructor when shared via instructor_branches", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-a" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-a" }, error: null }),
        classes: async () => ({ data: { id: "cls-a" }, error: null }),
        locations: async () => ({ data: { id: "loc-a" }, error: null }),
        instructors: async () => ({
          // Instructor is owned by a DIFFERENT branch (home branch B)
          data: [{ id: "inst-b", branch_id: "br-b" }],
          error: null,
        }),
        instructor_branches: async (state) => {
          // Shared into branch A
          expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: "br-a" });
          return { data: [{ instructor_id: "inst-b" }], error: null };
        },
        class_sessions: async (state) => {
          if (state.action === "select") {
            // Conflict gate does a preflight select of sessions for the date.
            return { data: [], error: null };
          }
          expect(state.action).toBe("insert");
          return { data: { id: "sess-1" }, error: null };
        },
        session_instructors: async () => ({ data: null, error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-a",
        schedule_id: "sch-a",
        class_id: "cls-a",
        location_id: "loc-a",
        day_of_week: "thursday",
        start_time: "08:00",
        end_time: "09:00",
        session_date: "2026-01-01",
        instructor_ids: ["inst-b"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });
});

