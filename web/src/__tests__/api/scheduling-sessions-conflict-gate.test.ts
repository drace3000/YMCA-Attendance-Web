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

describe("Smart Scheduler conflict gate - /api/scheduling/sessions POST/PUT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST rejects when a HIGH location double-booking would be created", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action !== "select") throw new Error("unexpected schedules action");
          return { data: { id: "sch-1", month_start: "2026-01-01" }, error: null };
        },
        classes: async () => ({ data: { id: "cls-1" }, error: null }),
        locations: async () => ({ data: { id: "loc-1" }, error: null }),
        // Conflict check reads existing sessions for that date
        class_sessions: async (state) => {
          if (state.action === "select") {
            return {
              data: [
                {
                  id: "sess-existing",
                  schedule_id: "sch-1",
                  branch_id: "br-1",
                  day_of_week: "MONDAY",
                  start_time: "08:00",
                  end_time: "09:00",
                  session_date: "2026-01-01",
                  location_id: "loc-1",
                },
              ],
              error: null,
            };
          }
          if (state.action === "insert") {
            throw new Error("should not insert when conflict gate blocks");
          }
          return { data: null, error: null };
        },
        session_instructors: async () => ({ data: [], error: null }),
        holidays: async () => ({ data: [], error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "monday",
        start_time: "08:30",
        end_time: "09:30",
        session_date: "2026-01-01",
        instructor_ids: [],
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe("Schedule conflict(s) detected");
    expect(Array.isArray(json.conflicts)).toBe(true);
    expect(json.conflicts.some((c: any) => c.type === "LOCATION_DOUBLE_BOOKING")).toBe(true);
  });

  it("POST rejects when session overlaps a closed holiday (HIGH)", async () => {
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
          if (state.action === "select") return { data: [], error: null };
          if (state.action === "insert") throw new Error("should not insert when conflict gate blocks");
          return { data: null, error: null };
        },
        session_instructors: async () => ({ data: [], error: null }),
        holidays: async () => ({
          data: [
            {
              holiday_date: "2026-01-01",
              observed_date: null,
              name: "New Year's Day",
              is_closed: true,
              closed_start_time: null,
              closed_end_time: null,
            },
          ],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "thursday",
        start_time: "09:00",
        end_time: "10:00",
        session_date: "2026-01-01",
        instructor_ids: [],
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(Array.isArray(json.conflicts)).toBe(true);
    expect(json.conflicts.some((c: any) => c.type === "HOLIDAY")).toBe(true);
  });

  it("PUT rejects when a HIGH instructor double-booking would be created", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        // Current session row for PUT
        class_sessions: async (state) => {
          if (state.action === "select") {
            // First select is current session (single)
            if (state.wantSingle && state.filters.some((f) => f.op === "eq" && f.column === "id")) {
              return {
                data: {
                  id: "sess-1",
                  branch_id: "br-1",
                  schedule_id: "sch-1",
                  day_of_week: "MONDAY",
                  start_time: "07:00",
                  end_time: "08:00",
                  session_date: "2026-01-01",
                  location_id: "loc-2",
                },
                error: null,
              };
            }

            // Next select is "other sessions on date" (not single)
            return {
              data: [
                {
                  id: "sess-existing",
                  schedule_id: "sch-1",
                  branch_id: "br-1",
                  day_of_week: "MONDAY",
                  start_time: "08:00",
                  end_time: "09:00",
                  session_date: "2026-01-01",
                  location_id: "loc-1",
                },
              ],
              error: null,
            };
          }

          if (state.action === "update") {
            throw new Error("should not update when conflict gate blocks");
          }

          return { data: null, error: null };
        },
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        // Existing instructor links: the other session has inst-1; current session will be updated to have inst-1 too
        session_instructors: async (state) => {
          if (state.action === "select") {
            return {
              data: [
                { session_id: "sess-existing", instructor_id: "inst-1" },
                { session_id: "sess-1", instructor_id: "inst-2" },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        },
        instructors: async () => ({ data: [], error: null }),
        instructor_branches: async () => ({ data: [], error: null }),
        classes: async () => ({ data: { id: "cls-1" }, error: null }),
        locations: async () => ({ data: { id: "loc-1" }, error: null }),
        holidays: async () => ({ data: [], error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "PUT",
      body: JSON.stringify({
        id: "sess-1",
        // Update this session to overlap and share instructor with sess-existing
        start_time: "08:30",
        end_time: "09:30",
        session_date: "2026-01-01",
        day_of_week: "monday",
        location_id: "loc-2",
        instructor_ids: ["inst-1"],
      }),
    });

    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe("Schedule conflict(s) detected");
    expect(Array.isArray(json.conflicts)).toBe(true);
    expect(json.conflicts.some((c: any) => c.type === "INSTRUCTOR_DOUBLE_BOOKING")).toBe(true);
  });
});

