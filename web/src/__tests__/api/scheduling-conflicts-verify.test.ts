import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/scheduling/conflicts/route";

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
      returns: () => builder,
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

describe("/api/scheduling/conflicts verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns HIGH conflicts for overlapping location sessions", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        class_sessions: async () => ({
          data: [
            {
              id: "a",
              day_of_week: "THURSDAY",
              start_time: "08:00",
              end_time: "09:00",
              session_date: "2026-01-01",
              location_id: "loc-1",
              class: { name: "A" },
              location: { code: "STUDIO" },
            },
            {
              id: "b",
              day_of_week: "THURSDAY",
              start_time: "08:30",
              end_time: "09:30",
              session_date: "2026-01-01",
              location_id: "loc-1",
              class: { name: "B" },
              location: { code: "STUDIO" },
            },
          ],
          error: null,
        }),
        session_instructors: async () => ({ data: [], error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/conflicts", {
      method: "POST",
      body: JSON.stringify({ schedule_id: "sch-1", branch_id: "br-1" }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.summary.high).toBeGreaterThan(0);
    expect(json.conflicts.some((c: any) => c.type === "LOCATION_DOUBLE_BOOKING")).toBe(true);
  });

  it("returns HIGH conflicts when instructor is outside availability windows for the schedule month", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        class_sessions: async () => ({
          data: [
            {
              id: "sess-1",
              day_of_week: "THURSDAY",
              start_time: "09:00",
              end_time: "10:00",
              session_date: "2026-01-01",
              location_id: "loc-1",
              class: { name: "A" },
              location: { code: "STUDIO" },
            },
          ],
          error: null,
        }),
        session_instructors: async () => ({
          data: [{ session_id: "sess-1", instructor_id: "inst-1" }],
          error: null,
        }),
        instructor_availability: async () => ({
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
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/conflicts", {
      method: "POST",
      body: JSON.stringify({ schedule_id: "sch-1", branch_id: "br-1" }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.summary.high).toBe(1);
    expect(json.conflicts.some((c: any) => c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY")).toBe(true);
  });

  it("returns LOW holiday info when a session falls on a non-closed holiday date", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        class_sessions: async () => ({
          data: [
            {
              id: "sess-1",
              day_of_week: "THURSDAY",
              start_time: "09:00",
              end_time: "10:00",
              session_date: "2026-01-01",
              location_id: "loc-1",
              class: { name: "A" },
              location: { code: "STUDIO" },
            },
          ],
          error: null,
        }),
        session_instructors: async () => ({ data: [], error: null }),
        instructor_availability: async () => ({ data: [], error: null }),
        holidays: async () => ({
          data: [{ holiday_date: "2026-01-01", name: "New Year's Day", is_closed: false }],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/conflicts", {
      method: "POST",
      body: JSON.stringify({ schedule_id: "sch-1", branch_id: "br-1" }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.summary.low).toBe(1);
    expect(json.conflicts.some((c: any) => c.type === "HOLIDAY" && c.severity === "LOW")).toBe(true);
  });

  it("returns HIGH holiday conflicts when the branch is closed on that holiday date", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        class_sessions: async () => ({
          data: [
            {
              id: "sess-1",
              day_of_week: "THURSDAY",
              start_time: "09:00",
              end_time: "10:00",
              session_date: "2026-01-01",
              location_id: "loc-1",
              class: { name: "A" },
              location: { code: "STUDIO" },
            },
          ],
          error: null,
        }),
        session_instructors: async () => ({ data: [], error: null }),
        instructor_availability: async () => ({ data: [], error: null }),
        holidays: async () => ({
          data: [{ holiday_date: "2026-01-01", name: "New Year's Day", is_closed: true }],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/conflicts", {
      method: "POST",
      body: JSON.stringify({ schedule_id: "sch-1", branch_id: "br-1" }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.summary.high).toBe(1);
    expect(json.conflicts.some((c: any) => c.type === "HOLIDAY" && c.severity === "HIGH")).toBe(true);
  });

  it("rejects branch users verifying other branches", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          // Branch user must be forced to their own branch regardless of requested branch_id.
          expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: "br-1" });
          return { data: { id: "sch-1", month_start: "2026-01-01" }, error: null };
        },
        class_sessions: async () => ({ data: [], error: null }),
        session_instructors: async () => ({ data: [], error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/conflicts", {
      method: "POST",
      body: JSON.stringify({ schedule_id: "sch-1", branch_id: "br-2" }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.branch_id).toBe("br-1");
  });
});

