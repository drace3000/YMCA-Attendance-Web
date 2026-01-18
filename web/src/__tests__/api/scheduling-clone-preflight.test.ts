import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/scheduling/clone/preflight/route";

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

describe("/api/scheduling/clone/preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects the most recent schedule and reports missing headcounts", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          // Most recent comes first (we don't simulate ordering; API uses [0])
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
        class_sessions: async () => ({
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
            {
              id: "sess-2",
              session_date: "2025-12-02",
              day_of_week: "TUESDAY",
              start_time: "09:00",
              end_time: "10:00",
              headcount: 12,
              class: { name: "Spin" },
              location: { code: "CYCLE" },
            },
          ],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/clone/preflight", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", program_group_id: "pg-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.source_schedule.id).toBe("sch-latest");
    expect(json.target_month_start).toBe("2026-01-01");
    expect(json.headcount.total_sessions).toBe(2);
    expect(json.headcount.missing_count).toBe(1);
    expect(json.headcount.missing_sessions).toHaveLength(1);
    expect(json.headcount.missing_sessions[0].id).toBe("sess-1");
  });
});

