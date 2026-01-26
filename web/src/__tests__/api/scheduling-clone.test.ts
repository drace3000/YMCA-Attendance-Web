import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/scheduling/clone/route";

const mockLoadUsFederalHolidaysJson = vi.fn();
vi.mock("@/lib/us-federal-holidays-source", () => ({
  loadUsFederalHolidaysJson: () => mockLoadUsFederalHolidaysJson(),
}));

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
    mockLoadUsFederalHolidaysJson.mockResolvedValue({
      title: "U.S. Federal Holidays",
      holidays: [
        {
          name: "New Year's Day",
          dates: {
            "2026": { date: "2026-01-01" },
          },
        },
      ],
    });
  });

  it("blocks cloning (prod gate) when headcounts are missing", async () => {
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
            return {
              data: [
                {
                  id: "sess-1",
                  session_date: "2025-12-01",
                  day_of_week: "MONDAY",
                  start_time: "09:00",
                  end_time: "10:00",
                  headcount: null,
                  class: { name: "Yoga" },
                  location: { code: "STUDIO" },
                },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      headers: { "x-ymca-emulate-prod-clone-gate": "1" },
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe("Missing headcounts in current schedule");
    expect(json.missing_headcount_count).toBe(1);
    expect(Array.isArray(json.missing_sessions)).toBe(true);
  });

  it("creates next month's schedule and maps session dates by weekday ordinal (headcounts reset)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    const insertedSessions: any[] = [];
    let createdSchedulePayload: any = null;
    let classSessionsSelectCalls = 0;
    const insertedConstraintEvents: any[] = [];
    let clearedConstraintEvents = false;

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
                is_approved: (state.payload as any)?.is_approved ?? false,
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
            // 1) headcount gate (details)
            // 2) source sessions
            if (classSessionsSelectCalls === 1) {
              return {
                data: [
                  {
                    id: "sess-src-1",
                    session_date: "2025-12-01",
                    day_of_week: "MONDAY",
                    start_time: "09:00",
                    end_time: "10:00",
                    headcount: null,
                    class: { name: "Yoga" },
                    location: { code: "STUDIO" },
                  },
                ],
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
        schedule_clone_audit: async () => ({ data: { id: "audit-1" }, error: null }),
        schedule_clone_constraint_events: async (state) => {
          if (state.action === "delete") {
            clearedConstraintEvents = true;
            return { data: [], error: null };
          }
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedConstraintEvents.push(...payload);
            else insertedConstraintEvents.push(payload);
            return { data: [], error: null };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(createdSchedulePayload).toMatchObject({
      branch_id: "br-1",
      program_group_id: "pg-1",
      month_start: "2026-01-01",
      status: "draft",
      is_approved: false,
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
    expect(insertedConstraintEvents).toHaveLength(0);
    expect(clearedConstraintEvents).toBe(true);
  });

  it("records exception events for skipped sessions (missing weekday occurrence)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    const insertedSessions: any[] = [];
    let classSessionsSelectCalls = 0;
    let auditInsertPayload: any = null;
    const insertedConstraintEvents: any[] = [];
    let clearedConstraintEvents = false;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action === "insert") {
            return {
              data: {
                id: "sch-new",
                name: (state.payload as any)?.name ?? "January 2026",
                month_start: (state.payload as any)?.month_start ?? "2026-01-01",
                status: (state.payload as any)?.status ?? "draft",
                is_approved: (state.payload as any)?.is_approved ?? false,
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

            // 1) headcount gate (details)
            if (classSessionsSelectCalls === 1) {
              return {
                data: [
                  {
                    id: "sess-src-1",
                    session_date: "2025-12-01",
                    day_of_week: "MONDAY",
                    start_time: "09:00",
                    end_time: "10:00",
                    headcount: null,
                    class: { name: "Yoga" },
                    location: { code: "STUDIO" },
                  },
                  {
                    id: "sess-src-5",
                    session_date: "2025-12-29", // 5th Monday of Dec 2025 -> missing in Jan 2026
                    day_of_week: "MONDAY",
                    start_time: "12:00",
                    end_time: "13:00",
                    headcount: null,
                    class: { name: "Spin" },
                    location: { code: "CYCLE" },
                  },
                ],
                error: null,
              };
            }

            // 2) source sessions
            return {
              data: [
                {
                  id: "sess-src-1",
                  class_id: "cls-1",
                  location_id: "loc-1",
                  day_of_week: "MONDAY",
                  start_time: "09:00",
                  end_time: "10:00",
                  session_date: "2025-12-01",
                  headcount: null,
                },
                {
                  id: "sess-src-5",
                  class_id: "cls-2",
                  location_id: "loc-2",
                  day_of_week: "MONDAY",
                  start_time: "12:00",
                  end_time: "13:00",
                  session_date: "2025-12-29",
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
          data: [
            { session_id: "sess-src-1", instructor_id: "inst-1" },
            { session_id: "sess-src-5", instructor_id: "inst-2" },
          ],
          error: null,
        }),
        schedule_clone_audit: async (state) => {
          if (state.action === "insert") {
            auditInsertPayload = state.payload;
            return { data: { id: "audit-1" }, error: null };
          }
          return { data: null, error: null };
        },
        schedule_clone_constraint_events: async (state) => {
          if (state.action === "delete") {
            clearedConstraintEvents = true;
            return { data: [], error: null };
          }
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedConstraintEvents.push(...payload);
            else insertedConstraintEvents.push(payload);
            return { data: [], error: null };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(insertedSessions).toHaveLength(1);
    expect(json.summary.created_sessions).toBe(1);
    expect(json.summary.skipped_sessions_total).toBe(1);
    expect(json.summary.modified_sessions_total).toBe(0);

    expect(auditInsertPayload).toMatchObject({
      sessions_created_count: 1,
      sessions_skipped_count: 1,
      deduped_skipped_count: 0,
    });

    expect(insertedConstraintEvents).toHaveLength(1);
    expect(insertedConstraintEvents[0]).toMatchObject({
      audit_id: "audit-1",
      event_type: "SKIPPED_MISSING_OCCURRENCE",
      source_session_id: "sess-src-5",
      target_schedule_id: "sch-new",
    });
    expect(clearedConstraintEvents).toBe(true);
  });

  it("copies missing instructor availability to target month and auto-imports January holidays (dev)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    let classSessionsSelectCalls = 0;
    const insertedAvailability: any[] = [];
    const insertedHolidays: any[] = [];

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          // create target schedule (insert uses .single(), so wantSingle=true even though this is NOT a select)
          if (state.action === "insert") {
            return {
              data: {
                id: "sch-new",
                name: (state.payload as any)?.name ?? "January 2026",
                month_start: (state.payload as any)?.month_start ?? "2026-01-01",
                status: (state.payload as any)?.status ?? "draft",
                is_approved: (state.payload as any)?.is_approved ?? false,
                branch_id: "br-1",
                program_group_id: "pg-1",
              },
              error: null,
            };
          }

          // maybeSingle existing target schedule
          if (state.action === "select" && state.wantSingle) return { data: null, error: null };

          // list schedules (source)
          if (state.action === "select") {
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
          }

          return { data: null, error: null };
        },
        class_sessions: async (state) => {
          if (state.action === "select") {
            classSessionsSelectCalls += 1;
            if (classSessionsSelectCalls === 1) {
              // headcount gate query
              return {
                data: [
                  {
                    id: "sess-src-1",
                    session_date: "2025-12-01",
                    day_of_week: "MONDAY",
                    start_time: "09:00",
                    end_time: "10:00",
                    headcount: 5,
                    class: { name: "Yoga" },
                    location: { code: "STUDIO" },
                  },
                ],
                error: null,
              };
            }

            // source sessions
            return {
              data: [
                {
                  id: "sess-src-1",
                  class_id: "cls-1",
                  location_id: "loc-1",
                  day_of_week: "MONDAY",
                  start_time: "09:00",
                  end_time: "10:00",
                  session_date: "2025-12-01",
                  headcount: 5,
                },
              ],
              error: null,
            };
          }

          if (state.action === "insert") {
            return { data: { id: "sess-new-1" }, error: null };
          }

          return { data: null, error: null };
        },
        session_instructors: async () => ({
          data: [{ session_id: "sess-src-1", instructor_id: "inst-1" }],
          error: null,
        }),
        instructor_availability: async (state) => {
          if (state.action === "select") {
            const monthEq = state.filters.find((f) => f.op === "eq" && f.column === "schedule_month")?.value;
            if (monthEq === "2025-12") {
              return {
                data: [
                  {
                    branch_id: "br-1",
                    instructor_id: "inst-1",
                    schedule_month: "2025-12",
                    day_of_week: "MONDAY",
                    available_start: "08:00",
                    available_end: "12:00",
                  },
                ],
                error: null,
              };
            }
            if (monthEq === "2026-01") {
              // target month has no rows yet
              return { data: [], error: null };
            }
            return { data: [], error: null };
          }
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedAvailability.push(...payload);
            else insertedAvailability.push(payload);
            return { data: [], error: null };
          }
          return { data: null, error: null };
        },
        holidays: async (state) => {
          if (state.action === "select") {
            return { data: [], error: null };
          }
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedHolidays.push(...payload);
            else insertedHolidays.push(payload);
            return { data: [], error: null };
          }
          return { data: null, error: null };
        },
        schedule_clone_audit: async () => ({ data: { id: "audit-1" }, error: null }),
        schedule_clone_constraint_events: async (state) => {
          if (state.action === "delete") return { data: [], error: null };
          if (state.action === "insert") return { data: [], error: null };
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.target_schedule.month_start).toBe("2026-01-01");

    expect(insertedAvailability).toHaveLength(1);
    expect(insertedAvailability[0]).toMatchObject({
      branch_id: "br-1",
      instructor_id: "inst-1",
      schedule_month: "2026-01",
      day_of_week: "MONDAY",
      available_start: "08:00",
      available_end: "12:00",
    });

    expect(insertedHolidays.length).toBeGreaterThan(0);
    expect(insertedHolidays[0]).toMatchObject({
      branch_id: "br-1",
      holiday_date: "2026-01-01",
      name: "New Year's Day",
      import_source: "US_FEDERAL",
    });
  });

  it("does not re-insert instructor availability on re-clone when target month times are returned as HH:mm:ss", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    let classSessionsSelectCalls = 0;
    const insertedAvailability: any[] = [];

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action === "insert") {
            return {
              data: {
                id: "sch-new",
                name: (state.payload as any)?.name ?? "January 2026",
                month_start: (state.payload as any)?.month_start ?? "2026-01-01",
                status: (state.payload as any)?.status ?? "draft",
                is_approved: (state.payload as any)?.is_approved ?? false,
                branch_id: "br-1",
                program_group_id: "pg-1",
              },
              error: null,
            };
          }
          if (state.action === "select" && state.wantSingle) return { data: null, error: null };
          if (state.action === "select") {
            return {
              data: [
                {
                  id: "sch-src",
                  name: "December 2025",
                  month_start: "2025-12-01",
                  status: "final",
                  branch_id: "br-1",
                  program_group_id: "pg-1",
                },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        },
        class_sessions: async (state) => {
          if (state.action === "select") {
            classSessionsSelectCalls += 1;
            if (classSessionsSelectCalls === 1) {
              // headcount gate query
              return {
                data: [
                  {
                    id: "sess-src-1",
                    session_date: "2025-12-01",
                    day_of_week: "MONDAY",
                    start_time: "09:00",
                    end_time: "10:00",
                    headcount: 5,
                    class: { name: "Yoga" },
                    location: { code: "STUDIO" },
                  },
                ],
                error: null,
              };
            }

            // source sessions
            return {
              data: [
                {
                  id: "sess-src-1",
                  class_id: "cls-1",
                  location_id: "loc-1",
                  day_of_week: "MONDAY",
                  start_time: "09:00",
                  end_time: "10:00",
                  session_date: "2025-12-01",
                  headcount: 5,
                },
              ],
              error: null,
            };
          }
          if (state.action === "insert") return { data: { id: "sess-new-1" }, error: null };
          return { data: null, error: null };
        },
        session_instructors: async () => ({
          data: [{ session_id: "sess-src-1", instructor_id: "inst-1" }],
          error: null,
        }),
        instructor_availability: async (state) => {
          if (state.action === "select") {
            const monthEq = state.filters.find((f) => f.op === "eq" && f.column === "schedule_month")?.value;
            if (monthEq === "2025-12") {
              // Source month has an availability row.
              return {
                data: [
                  {
                    branch_id: "br-1",
                    instructor_id: "inst-1",
                    schedule_month: "2025-12",
                    day_of_week: "MONDAY",
                    available_start: "09:00",
                    available_end: "10:00",
                  },
                ],
                error: null,
              };
            }
            if (monthEq === "2026-01") {
              // Target month already has the same row, but returned with seconds.
              return {
                data: [
                  {
                    branch_id: "br-1",
                    instructor_id: "inst-1",
                    schedule_month: "2026-01",
                    day_of_week: "MONDAY",
                    available_start: "09:00:00",
                    available_end: "10:00:00",
                  },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          }
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedAvailability.push(...payload);
            else insertedAvailability.push(payload);
            return { data: [], error: null };
          }
          return { data: null, error: null };
        },
        holidays: async () => ({ data: [], error: null }),
        schedule_clone_audit: async () => ({ data: { id: "audit-1" }, error: null }),
        schedule_clone_constraint_events: async (state) => {
          if (state.action === "delete") return { data: [], error: null };
          if (state.action === "insert") return { data: [], error: null };
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.target_schedule.month_start).toBe("2026-01-01");
    expect(insertedAvailability).toHaveLength(0);
  });

  it("skips a session when the only instructor is unavailable in the target month (availability enforced)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    let classSessionsSelectCalls = 0;
    const insertedSessions: any[] = [];
    const insertedConstraintEvents: any[] = [];
    let auditInsertPayload: any = null;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action === "insert") {
            return {
              data: {
                id: "sch-new",
                name: (state.payload as any)?.name ?? "January 2026",
                month_start: (state.payload as any)?.month_start ?? "2026-01-01",
                status: (state.payload as any)?.status ?? "draft",
                is_approved: (state.payload as any)?.is_approved ?? false,
                branch_id: "br-1",
                program_group_id: "pg-1",
              },
              error: null,
            };
          }
          if (state.action === "select" && state.wantSingle) return { data: null, error: null };
          if (state.action === "select") {
            return {
              data: [
                {
                  id: "sch-src",
                  name: "December 2025",
                  month_start: "2025-12-01",
                  status: "final",
                  branch_id: "br-1",
                  program_group_id: "pg-1",
                },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        },
        class_sessions: async (state) => {
          if (state.action === "select") {
            classSessionsSelectCalls += 1;
            if (classSessionsSelectCalls === 1) {
              // headcount gate query
              return {
                data: [
                  {
                    id: "sess-src-sat",
                    session_date: "2025-12-06",
                    day_of_week: "SATURDAY",
                    start_time: "07:15",
                    end_time: "07:45",
                    headcount: 5,
                    class: { name: "Test" },
                    location: { code: "STUDIO" },
                  },
                ],
                error: null,
              };
            }
            // source sessions
            return {
              data: [
                {
                  id: "sess-src-sat",
                  class_id: "cls-1",
                  location_id: "loc-1",
                  day_of_week: "SATURDAY",
                  start_time: "07:15",
                  end_time: "07:45",
                  session_date: "2025-12-06", // 1st Saturday of Dec 2025 -> 2026-01-03
                  headcount: 5,
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
        session_instructors: async (state) => {
          if (state.action === "select") {
            return { data: [{ session_id: "sess-src-sat", instructor_id: "inst-1" }], error: null };
          }
          return { data: [], error: null };
        },
        instructor_availability: async (state) => {
          if (state.action === "select") {
            const monthEq = state.filters.find((f) => f.op === "eq" && f.column === "schedule_month")?.value;
            // Source month has no rows; copy step becomes a no-op.
            if (monthEq === "2025-12") return { data: [], error: null };

            // Target month has rules for inst-1, but NOT Saturday => Saturday should be unavailable.
            if (monthEq === "2026-01") {
              return {
                data: [
                  {
                    branch_id: "br-1",
                    instructor_id: "inst-1",
                    schedule_month: "2026-01",
                    day_of_week: "MONDAY",
                    available_start: "09:00",
                    available_end: "10:00",
                  },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        schedule_clone_audit: async (state) => {
          if (state.action === "insert") {
            auditInsertPayload = state.payload;
            return { data: { id: "audit-1" }, error: null };
          }
          return { data: null, error: null };
        },
        schedule_clone_constraint_events: async (state) => {
          if (state.action === "delete") return { data: [], error: null };
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedConstraintEvents.push(...payload);
            else insertedConstraintEvents.push(payload);
            return { data: [], error: null };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary.created_sessions).toBe(0);
    expect(json.summary.skipped_constraint_conflicts).toBe(1);
    expect(json.summary.skipped_sessions_total).toBeGreaterThanOrEqual(1);

    expect(insertedSessions).toHaveLength(0);

    expect(auditInsertPayload).toMatchObject({
      sessions_created_count: 0,
    });

    expect(insertedConstraintEvents.some((e) => e.event_type === "SKIPPED_CONSTRAINT_CONFLICT")).toBe(true);
  });

  it("skips sessions when any instructor violates availability constraints", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    let classSessionsSelectCalls = 0;
    const insertedSessions: any[] = [];
    const insertedLinks: any[] = [];
    const insertedConstraintEvents: any[] = [];

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action === "insert") {
            return {
              data: {
                id: "sch-new",
                name: (state.payload as any)?.name ?? "January 2026",
                month_start: (state.payload as any)?.month_start ?? "2026-01-01",
                status: (state.payload as any)?.status ?? "draft",
                is_approved: (state.payload as any)?.is_approved ?? false,
                branch_id: "br-1",
                program_group_id: "pg-1",
              },
              error: null,
            };
          }
          if (state.action === "select" && state.wantSingle) return { data: null, error: null };
          if (state.action === "select") {
            return {
              data: [
                {
                  id: "sch-src",
                  name: "December 2025",
                  month_start: "2025-12-01",
                  status: "final",
                  branch_id: "br-1",
                  program_group_id: "pg-1",
                },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        },
        class_sessions: async (state) => {
          if (state.action === "select") {
            classSessionsSelectCalls += 1;
            if (classSessionsSelectCalls === 1) {
              // headcount gate query
              return {
                data: [
                  {
                    id: "sess-src-sat",
                    session_date: "2025-12-06",
                    day_of_week: "SATURDAY",
                    start_time: "07:15",
                    end_time: "07:45",
                    headcount: 5,
                    class: { name: "Test" },
                    location: { code: "STUDIO" },
                  },
                ],
                error: null,
              };
            }
            // source sessions
            return {
              data: [
                {
                  id: "sess-src-sat",
                  class_id: "cls-1",
                  location_id: "loc-1",
                  day_of_week: "SATURDAY",
                  start_time: "07:15",
                  end_time: "07:45",
                  session_date: "2025-12-06",
                  headcount: 5,
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
        session_instructors: async (state) => {
          if (state.action === "select") {
            return {
              data: [
                { session_id: "sess-src-sat", instructor_id: "inst-1" },
                { session_id: "sess-src-sat", instructor_id: "inst-2" },
              ],
              error: null,
            };
          }
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedLinks.push(...payload);
            else insertedLinks.push(payload);
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        instructor_availability: async (state) => {
          if (state.action === "select") {
            const monthEq = state.filters.find((f) => f.op === "eq" && f.column === "schedule_month")?.value;
            // Source month has no rows; copy step becomes a no-op.
            if (monthEq === "2025-12") return { data: [], error: null };

            if (monthEq === "2026-01") {
              return {
                data: [
                  // inst-1 is available on Saturday for 07:15-07:45
                  {
                    branch_id: "br-1",
                    instructor_id: "inst-1",
                    schedule_month: "2026-01",
                    day_of_week: "SATURDAY",
                    available_start: "07:00",
                    available_end: "08:00",
                  },
                  // inst-2 has month rules but not Saturday => should be dropped.
                  {
                    branch_id: "br-1",
                    instructor_id: "inst-2",
                    schedule_month: "2026-01",
                    day_of_week: "MONDAY",
                    available_start: "09:00",
                    available_end: "10:00",
                  },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        schedule_clone_audit: async () => ({ data: { id: "audit-1" }, error: null }),
        schedule_clone_constraint_events: async (state) => {
          if (state.action === "delete") return { data: [], error: null };
          if (state.action === "insert") {
            const payload = state.payload as any;
            if (Array.isArray(payload)) insertedConstraintEvents.push(...payload);
            else insertedConstraintEvents.push(payload);
            return { data: [], error: null };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary.created_sessions).toBe(0);
    expect(json.summary.modified_sessions_total).toBe(0);

    expect(insertedLinks).toHaveLength(0);
    expect(insertedConstraintEvents.some((e) => e.event_type === "SKIPPED_CONSTRAINT_CONFLICT")).toBe(true);
  });
});

