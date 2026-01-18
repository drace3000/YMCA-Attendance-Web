import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as CREATE_SESSION, PUT as UPDATE_SESSION, DELETE as DELETE_SESSION } from "@/app/api/scheduling/sessions/route";
import { POST as PUBLISH } from "@/app/api/scheduling/publish/route";

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

vi.mock("@/lib/error-logger", () => ({
  logError: vi.fn(async () => "E_TEST"),
  getUserErrorMessage: (code: string) => code,
}));

describe("Approval lock enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks creating a session when schedule is pending approval", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({
          data: { id: "sch-1", month_start: "2026-01-01", is_approved: false },
          error: null,
        }),
        classes: async () => {
          throw new Error("should not validate class when schedule is locked");
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
        session_date: "2026-01-05",
        instructor_ids: [],
      }),
    });

    const res = await CREATE_SESSION(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(String(json.error)).toMatch(/pending approval/i);
  });

  it("blocks updating a session when schedule is pending approval", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        class_sessions: async (state) => {
          if (state.action === "select") {
            return {
              data: {
                id: "sess-1",
                branch_id: "br-1",
                schedule_id: "sch-1",
                day_of_week: "MONDAY",
                start_time: "09:00",
                end_time: "10:00",
                session_date: "2026-01-05",
                location_id: "loc-1",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        schedules: async () => ({
          data: { id: "sch-1", is_approved: false },
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "PUT",
      body: JSON.stringify({ id: "sess-1", start_time: "10:00" }),
    });

    const res = await UPDATE_SESSION(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(String(json.error)).toMatch(/pending approval/i);
  });

  it("blocks deleting a session when schedule is pending approval", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        class_sessions: async () => ({
          data: { id: "sess-1", branch_id: "br-1", schedule_id: "sch-1" },
          error: null,
        }),
        schedules: async () => ({
          data: { id: "sch-1", is_approved: false },
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions?id=sess-1", {
      method: "DELETE",
    });

    const res = await DELETE_SESSION(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(String(json.error)).toMatch(/pending approval/i);
  });

  it("blocks publishing when schedule is pending approval", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({
          data: {
            id: "sch-1",
            name: "January 2026",
            month_start: "2026-01-01",
            status: "draft",
            is_approved: false,
            published_at: null,
            branch_id: "br-1",
            program_group_id: "pg-1",
          },
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/publish", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", schedule_id: "sch-1" }),
    });

    const res = await PUBLISH(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(String(json.error)).toMatch(/pending approval/i);
  });
});

