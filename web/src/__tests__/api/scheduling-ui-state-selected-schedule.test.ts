import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/scheduling/ui-state/route";

type MockQueryState = {
  table: string;
  action: "select" | "upsert";
  payload?: unknown;
  onConflict?: string;
  filters: Array<{ op: "eq" | "in"; column: string; value: unknown }>;
  wantSingle: boolean;
};

type MockHandlerResult = { data: unknown; error: { message: string } | null };
type MockTableHandler = (state: MockQueryState) => Promise<MockHandlerResult> | MockHandlerResult;

function createMockAuthClient(handlers: Record<string, MockTableHandler>) {
  function makeBuilder(table: string) {
    const state: MockQueryState = {
      table,
      action: "select",
      filters: [],
      wantSingle: false,
    };

    const builder: any = {
      select: () => builder,
      upsert: (payload: unknown, opts?: { onConflict?: string }) => {
        state.action = "upsert";
        state.payload = payload;
        state.onConflict = opts?.onConflict;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.filters.push({ op: "eq", column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push({ op: "in", column, value });
        return builder;
      },
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
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } }, error: null })),
    },
    from: (table: string) => makeBuilder(table),
  };
}

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: unknown[]) => mockRequireRecipientAccess(...args),
}));

const mockCreateSupabaseAuthRouteClient = vi.fn();
vi.mock("@/lib/supabaseAuthRouteClient", () => ({
  createSupabaseAuthRouteClient: (...args: unknown[]) => mockCreateSupabaseAuthRouteClient(...args),
}));

describe("/api/scheduling/ui-state selected_schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST persists selected_schedule for user+branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    let upsertPayload: unknown = null;
    let upsertOnConflict: string | undefined;

    const client = createMockAuthClient({
      branch_user_ui_state: (state) => {
        if (state.action === "upsert") {
          upsertPayload = state.payload;
          upsertOnConflict = state.onConflict;
          return { data: null, error: null };
        }
        return { data: null, error: null };
      },
    });

    mockCreateSupabaseAuthRouteClient.mockReturnValue(client);

    const req = new NextRequest("http://localhost/api/scheduling/ui-state", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        key: "selected_schedule",
        value: { program_group_id: "pg-1", schedule_id: "sch-1", month_start: "2025-11-01" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(upsertOnConflict).toBe("branch_id,user_id,scope,key");
    expect(upsertPayload).toMatchObject({
      branch_id: "br-1",
      user_id: "user-1",
      scope: "smart_scheduler",
      key: "selected_schedule",
      value: { program_group_id: "pg-1", schedule_id: "sch-1", month_start: "2025-11-01" },
    });
  });

  it("GET returns selectedSchedule when stored", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    const client = createMockAuthClient({
      branch_user_ui_state: (state) => {
        const keyIn = state.filters.find((f) => f.op === "in" && f.column === "key")?.value;
        expect(Array.isArray(keyIn)).toBe(true);
        expect((keyIn as unknown[]).includes("selected_schedule")).toBe(true);

        return {
          data: [
            {
              key: "selected_schedule",
              value: { program_group_id: "pg-1", schedule_id: "sch-1", month_start: "2025-11-01" },
            },
          ],
          error: null,
        };
      },
    });

    mockCreateSupabaseAuthRouteClient.mockReturnValue(client);

    const req = new NextRequest("http://localhost/api/scheduling/ui-state?branch_id=br-1", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.selectedSchedule).toEqual({ program_group_id: "pg-1", schedule_id: "sch-1", month_start: "2025-11-01" });
  });

  it("POST returns 400 for invalid selected_schedule payload", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    // Should fail validation before hitting auth client.
    mockCreateSupabaseAuthRouteClient.mockImplementation(() => {
      throw new Error("should not create auth route client for invalid payload");
    });

    const req = new NextRequest("http://localhost/api/scheduling/ui-state", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        key: "selected_schedule",
        value: { program_group_id: "pg-1", schedule_id: "sch-1", month_start: "2025-11" }, // invalid date
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

