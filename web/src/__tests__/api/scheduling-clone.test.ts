import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/scheduling/clone/route";

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
      returns: () => builder,
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

describe("/api/scheduling/clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks cloning when headcounts are missing and override is false", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.wantSingle) return { data: null, error: null };
          return {
            data: [
              {
                id: "sch-latest",
                name: "December 2025",
                month_start: "2025-12-01",
                status: "final",
                branch_id: "br-1",
                program_group_id: "pg-1",
              },
            ],
            error: null,
          };
        },
        class_sessions: async (state) => {
          // headcount gate query
          if (state.action === "select") {
            return { data: [{ id: "sess-1", headcount: null }], error: null };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1", override_missing_headcounts: false }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe("Missing headcounts in current schedule");
    expect(json.missing_headcount_count).toBe(1);
  });

  it("creates next month's schedule and maps session dates by weekday ordinal when override is true", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    const insertedSessions: any[] = [];
    let createdSchedulePayload: any = null;
    let classSessionsSelectCalls = 0;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action === "insert") {
            createdSchedulePayload = state.payload;
            return {
              data: {
                id: "sch-new",
                name: (state.payload as any)?.name ?? "January 2026",
                month_start: (state.payload as any)?.month_start ?? "2026-01-01",
                status: (state.payload as any)?.status ?? "draft",
                branch_id: "br-1",
                program_group_id: "pg-1",
              },
              error: null,
            };
          }

          // maybeSingle existing target schedule
          if (state.wantSingle) return { data: null, error: null };

          // list schedules (source)
          return {
            data: [
              {
                id: "sch-latest",
                name: "December 2025",
                month_start: "2025-12-01",
                status: "final",
                branch_id: "br-1",
                program_group_id: "pg-1",
              },
            ],
            error: null,
          };
        },
        class_sessions: async (state) => {
          if (state.action === "select") {
            classSessionsSelectCalls += 1;

            // The clone route selects from class_sessions twice:
            // 1) headcount gate: select("id, headcount")
            // 2) source sessions: select("id, class_id, location_id, ... session_date ...")
            if (classSessionsSelectCalls === 1) {
              return {
                data: [{ id: "sess-src-1", headcount: null }],
                error: null,
              };
            }

            return {
              data: [
                {
                  id: "sess-src-1",
                  class_id: "cls-1",
                  location_id: "loc-1",
                  day_of_week: "MONDAY",
                  start_time: "09:00",
                  end_time: "10:00",
                  session_date: "2025-12-01", // 1st Monday of Dec 2025
                  headcount: null,
                },
              ],
              error: null,
            };
          }

          if (state.action === "insert") {
            insertedSessions.push(state.payload);
            return { data: { id: `sess-new-${insertedSessions.length}` }, error: null };
          }

          return { data: null, error: null };
        },
        session_instructors: async () => ({
          data: [{ session_id: "sess-src-1", instructor_id: "inst-1" }],
          error: null,
        }),
        schedule_clone_audit: async () => ({ data: { ok: true }, error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1", override_missing_headcounts: true }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(createdSchedulePayload).toMatchObject({
      branch_id: "br-1",
      program_group_id: "pg-1",
      month_start: "2026-01-01",
      status: "draft",
      cloned_from_id: "sch-latest",
    });

    // 1st Monday of Jan 2026 is 2026-01-05
    expect(insertedSessions).toHaveLength(1);
    const inserted = insertedSessions[0];
    expect(inserted).toMatchObject({
      schedule_id: "sch-new",
      session_date: "2026-01-05",
      day_of_week: "MONDAY",
      start_time: "09:00",
      end_time: "10:00",
      class_id: "cls-1",
      location_id: "loc-1",
      effective_month: "2026-01-01",
      headcount: null,
    });

    expect(json.target_schedule.id).toBe("sch-new");
    expect(json.summary.created_sessions).toBe(1);
  });
});

