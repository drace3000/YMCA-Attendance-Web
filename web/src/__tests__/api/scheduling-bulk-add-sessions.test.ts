import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/scheduling/bulk-add-sessions/route";
import { sendEmail } from "@/lib/email-sender";

type MockQueryState = {
  table: string;
  action: "select" | "insert";
  payload?: unknown;
  filters: Array<{ op: "eq" | "in"; column: string; value: unknown }>;
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
      eq: (column: string, value: unknown) => {
        state.filters.push({ op: "eq", column, value });
        return builder;
      },
      in: (column: string, value: unknown) => {
        state.filters.push({ op: "in", column, value });
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

vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}));

vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: vi.fn(async () => ({
    ok: true,
    access: { recipient_type: "Branch", branch_id: "br-1" },
  })),
}));

vi.mock("@/lib/email-sender", () => ({
  sendEmail: vi.fn(async () => ({ ok: true, messageId: "msg-1" })),
}));

let mockSupabaseClient: ReturnType<typeof createMockSupabaseClient>;

describe("bulk add sessions API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when required fields are missing", async () => {
    mockSupabaseClient = createMockSupabaseClient({});
    const req = new NextRequest("http://localhost/api/scheduling/bulk-add-sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates sessions and sends confirmation emails", async () => {
    mockSupabaseClient = createMockSupabaseClient({
      schedules: () => ({
        data: {
          id: "sch-1",
          branch_id: "br-1",
          month_start: "2025-12-01",
          is_approved: true,
          name: "December 2025",
        },
        error: null,
      }),
      classes: () => ({ data: { id: "cls-1", name: "ACTIVE YOGA" }, error: null }),
      locations: () => ({ data: { id: "loc-1" }, error: null }),
      class_sessions: (state) => {
        if (state.action === "insert") {
          return {
            data: [
              { id: "sess-1", session_date: "2025-12-01", start_time: "08:00", end_time: "08:30" },
              { id: "sess-2", session_date: "2025-12-08", start_time: "08:00", end_time: "08:30" },
            ],
            error: null,
          };
        }
        return { data: null, error: null };
      },
      session_instructors: () => ({ data: null, error: null }),
      instructors: () => ({
        data: [
          {
            id: "inst-1",
            nickname: "JULIE",
            first_name: "Julie",
            last_name: "S",
            auth_user_id: "auth-1",
          },
        ],
        error: null,
      }),
      branch_schedule_recipients: () => ({
        data: [{ auth_user_id: "auth-1", email: "julie@ymca.org", is_active: true }],
        error: null,
      }),
    });

    const payload = {
      branch_id: "br-1",
      schedule_id: "sch-1",
      schedule_year: 2025,
      schedule_month: 12,
      class_id: "cls-1",
      location_id: "loc-1",
      instructor_ids: ["inst-1"],
      slots: [
        { date: "2025-12-01", start_time: "08:00", end_time: "08:30" },
        { date: "2025-12-08", start_time: "08:00", end_time: "08:30" },
      ],
      email: {
        send_to_instructors: true,
        send_to_manager: true,
        manager_email: "manager@ymca.org",
      },
    };

    const req = new NextRequest("http://localhost/api/scheduling/bulk-add-sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created_session_ids).toEqual(["sess-1", "sess-2"]);

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Confirmation of assigned classes",
        to: expect.arrayContaining(["julie@ymca.org", "manager@ymca.org"]),
      }),
    );
  });
});
