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

describe("Smart Scheduler availability gate - /api/scheduling/sessions POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST rejects when instructor has availability windows for the month but the session is outside allowed windows", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        classes: async () => ({ data: { id: "cls-1" }, error: null }),
        locations: async () => ({ data: { id: "loc-1" }, error: null }),
        class_sessions: async (state) => {
          if (state.action === "select") {
            return { data: [], error: null };
          }
          if (state.action === "insert") {
            throw new Error("should not insert when unavailability blocks");
          }
          return { data: null, error: null };
        },
        session_instructors: async () => ({ data: [], error: null }),
        instructors: async () => ({ data: [{ id: "inst-1", branch_id: "br-1" }], error: null }),
        instructor_branches: async () => ({ data: [], error: null }),
        instructor_availability: async (state) => {
          if (state.action !== "select") return { data: null, error: null };

          return {
            data: [
              {
                instructor_id: "inst-1",
                schedule_month: "2026-01",
                day_of_week: "THURSDAY",
                available_start: "08:00:00",
                available_end: "09:00:00",
              },
            ],
            error: null,
          };
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
        day_of_week: "THURSDAY",
        start_time: "09:00",
        end_time: "09:30",
        session_date: "2026-01-01",
        instructor_ids: ["inst-1"],
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe("Schedule conflict(s) detected");
    expect(Array.isArray(json.conflicts)).toBe(true);
    expect(json.conflicts.some((c: any) => c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY")).toBe(true);
  });
});

