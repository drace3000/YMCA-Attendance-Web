import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as sendPOST } from "@/app/api/scheduling/slot-helper-review/send/route";
import { GET as statusGET } from "@/app/api/scheduling/slot-helper-review/status/route";
import { GET as requestGET } from "@/app/api/scheduling/slot-helper-review/request/route";
import { POST as submitPOST } from "@/app/api/scheduling/slot-helper-review/submit/route";
import { GET as requestDetailGET } from "@/app/api/scheduling/slot-helper-review/request-detail/route";
import { POST as completePOST } from "@/app/api/scheduling/slot-helper-review/complete/route";
import { POST as overridePOST } from "@/app/api/scheduling/slot-helper-review/override/route";

vi.mock("@/lib/email-sender", () => ({
  sendEmail: vi.fn(async () => ({ ok: true, messageId: "msg-1" })),
}));

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "update";
  payload?: unknown;
  filters: Array<{ op: "eq" | "in" | "is" | "gt"; column: string; value: unknown }>;
  wantSingle: boolean;
  orderBy?: { column: string; ascending: boolean } | null;
  limitN?: number | null;
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
      orderBy: null,
      limitN: null,
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
      eq: (column: string, value: unknown) => {
        state.filters.push({ op: "eq", column, value });
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
      order: (column: string, opts?: { ascending?: boolean }) => {
        state.orderBy = { column, ascending: opts?.ascending !== false };
        return builder;
      },
      limit: (n: number) => {
        state.limitN = n;
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
  return { from: (table: string) => makeBuilder(table) };
}

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

const mockSupabaseAdmin = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

describe("/api/scheduling/slot-helper-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseAdmin.from.mockReset();
  });

  it("send: creates request + holds + sends email (falls back to don.race@outlook.com when no instructor email)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-admin", email: "admin@example.com" },
    });

    let insertedPayload: any = null;
    let insertedHolds: any = null;
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({
          data: { id: "sch-1", name: "January 2026", month_start: "2026-01-01", branch_id: "br-1" },
          error: null,
        }),
        ymca_branches: async () => ({
          data: { id: "br-1", name: "Eastside Family YMCA", schedule_email_from: "sched@example.com", branch_manager_email: "manager@example.com" },
          error: null,
        }),
        instructors: async () => ({
          data: { id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M", auth_user_id: null },
          error: null,
        }),
        classes: async () => ({
          data: { id: "class-1", name: "Spin" },
          error: null,
        }),
        locations: async () => ({
          data: { id: "loc-1", code: "STUDIO", name: "Studio" },
          error: null,
        }),
        branch_schedule_recipients: async () => ({ data: null, error: null }),
        slot_helper_review_requests: async (state) => {
          if (state.action !== "insert") return { data: null, error: null };
          insertedPayload = state.payload;
          return { data: { id: "req-1", created_at: "2026-01-15T00:00:00Z", expires_at: "2026-01-17T00:00:00Z" }, error: null };
        },
        slot_helper_slot_holds: async (state) => {
          if (state.action !== "insert") return { data: null, error: null };
          insertedHolds = state.payload;
          return { data: { ok: true }, error: null };
        },
        slot_helper_review_email_log: async () => ({ data: { ok: true }, error: null }),
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/slot-helper-review/send?branch_id=br-1", {
      method: "POST",
      body: JSON.stringify({
        schedule_id: "sch-1",
        instructor_ids: ["inst-1"],
        slots: [{ date: "2026-01-01", start_time: "06:00", end_time: "07:00" }],
        context: { class_id: "class-1", location_id: "loc-1" },
      }),
    });

    const res = await sendPOST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.email.to).toEqual(["don.race@outlook.com"]);

    expect(insertedPayload?.class_id).toBe("class-1");
    expect(insertedPayload?.location_id).toBe("loc-1");
    expect(Array.isArray(insertedPayload?.instructor_ids)).toBe(true);
    expect(Array.isArray(insertedHolds)).toBe(true);
    expect(insertedHolds?.[0]?.slot_date).toBe("2026-01-01");
  });

  it("status: returns latest slot review email log + latest slot review request", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        slot_helper_review_email_log: async () => ({
          data: [
            { sent_at: "2026-01-15T01:00:00Z", from_email: "x", to_email: "y", subject: "Other", message_id: "m0" },
            { sent_at: "2026-01-15T00:00:00Z", from_email: "x", to_email: "y", subject: "Eastside Family YMCA — Slot Review Requested (January 2026)", message_id: "m1" },
          ],
          error: null,
        }),
        slot_helper_review_requests: async () => ({
          data: [
            {
              id: "req-2",
              created_at: "2026-01-15T02:00:00Z",
              expires_at: "2026-01-17T02:00:00Z",
              sent_at: "2026-01-15T02:01:00Z",
              responded_at: null,
              response_selected_hold_ids: [],
              response_comment: null,
              completed_at: null,
              overridden_at: null,
            },
          ],
          error: null,
        }),
        slot_helper_slot_holds: async () => ({
          data: [
            { id: "hold-1", slot_date: "2026-01-01", start_time: "06:00", end_time: "07:00" },
          ],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/slot-helper-review/status?branch_id=br-1&schedule_id=sch-1");
    const res = await statusGET(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.email).toBeTruthy();
    expect(json.request).toBeTruthy();
  });

  it("request: loads request by token and returns context", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

    const adminClient = createMockSupabaseClient({
        slot_helper_review_requests: async () => ({
          data: {
            id: "req-1",
            branch_id: "br-1",
            schedule_id: "sch-1",
            created_at: "2026-01-15T00:00:00Z",
            expires_at: "2099-01-17T00:00:00Z",
            responded_at: null,
            response_selected_hold_ids: [],
            response_comment: null,
          },
          error: null,
        }),
        slot_helper_slot_holds: async () => ({
          data: [
            { id: "hold-1", slot_date: "2026-01-01", start_time: "06:00", end_time: "07:00", released_at: null, consumed_at: null },
          ],
          error: null,
        }),
        ymca_branches: async () => ({ data: { id: "br-1", name: "Eastside Family YMCA" }, error: null }),
        schedules: async () => ({ data: { id: "sch-1", name: "January 2026" }, error: null }),
      });
    mockSupabaseAdmin.from.mockImplementation(adminClient.from);

    const req = new NextRequest("http://localhost/api/scheduling/slot-helper-review/request?t=tok-1");
    const res = await requestGET(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.context.branch_name).toBe("Eastside Family YMCA");
    expect(Array.isArray(json.holds)).toBe(true);
  });

  it("submit: validates selection and updates request, then notifies branch manager", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

    let updatedPayload: any = null;
    let notifyLogPayload: any = null;
    let releasedPayload: any = null;

    const adminClient = createMockSupabaseClient({
        slot_helper_review_requests: async (state) => {
          if (state.action === "update") {
            updatedPayload = state.payload;
            return { data: { ok: true }, error: null };
          }
          return {
            data: {
              id: "req-1",
              branch_id: "br-1",
              schedule_id: "sch-1",
              instructor_ids: ["inst-1"],
              expires_at: "2099-01-17T00:00:00Z",
            },
            error: null,
          };
        },
        slot_helper_slot_holds: async (state) => {
          if (state.action === "update") {
            releasedPayload = state.payload;
            return { data: { ok: true }, error: null };
          }
          return {
            data: [{ id: "hold-1" }, { id: "hold-2" }],
            error: null,
          };
        },
        ymca_branches: async () => ({
          data: { id: "br-1", name: "Eastside Family YMCA", schedule_email_from: "sched@example.com", branch_manager_email: "manager@example.com" },
          error: null,
        }),
        schedules: async () => ({ data: { id: "sch-1", name: "January 2026" }, error: null }),
        schedule_reschedule_submit_notify_log: async (state) => {
          if (state.action !== "insert") return { data: null, error: null };
          notifyLogPayload = state.payload;
          return { data: { ok: true }, error: null };
        },
      });
    mockSupabaseAdmin.from.mockImplementation(adminClient.from);

    const req = new NextRequest("http://localhost/api/scheduling/slot-helper-review/submit", {
      method: "POST",
      body: JSON.stringify({
        t: "tok-1",
        selected_hold_ids: ["hold-1"],
        comment: "Looks good.",
      }),
    });

    const res = await submitPOST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(updatedPayload?.response_selected_hold_ids).toEqual(["hold-1"]);
    expect(updatedPayload?.response_comment).toBe("Looks good.");
    expect(String(notifyLogPayload?.to_email ?? "")).toContain("manager@example.com");
    expect(releasedPayload).toEqual({ released_at: expect.any(String) });
  });

  it("request-detail: returns request, holds, and latest email log", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        slot_helper_review_requests: async () => ({
          data: {
            id: "req-1",
            branch_id: "br-1",
            schedule_id: "sch-1",
            class_id: "class-1",
            location_id: "loc-1",
            instructor_ids: ["inst-1"],
            created_at: "2026-01-15T00:00:00Z",
            expires_at: "2099-01-17T00:00:00Z",
            sent_at: "2026-01-15T00:05:00Z",
            responded_at: null,
            response_selected_hold_ids: [],
            response_comment: null,
            completed_at: null,
            overridden_at: null,
          },
          error: null,
        }),
        slot_helper_slot_holds: async () => ({
          data: [
            {
              id: "hold-1",
              slot_date: "2026-01-01",
              start_time: "06:00",
              end_time: "07:00",
              released_at: null,
              consumed_at: null,
              transition_minutes: 10,
              turnover_minutes: 5,
            },
          ],
          error: null,
        }),
        slot_helper_review_email_log: async () => ({
          data: [
            { sent_at: "2026-01-15T00:06:00Z", from_email: "x", to_email: "y", subject: "Slot Review", message_id: "m1" },
          ],
          error: null,
        }),
      }),
    );

    const req = new NextRequest(
      "http://localhost/api/scheduling/slot-helper-review/request-detail?branch_id=br-1&request_id=req-1",
    );
    const res = await requestDetailGET(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.request?.id).toBe("req-1");
    expect(Array.isArray(json.holds)).toBe(true);
    expect(json.email?.message_id).toBe("m1");
  });

  it("complete: marks request complete and releases holds", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    let updatePayload: any = null;
    let releasePayload: any = null;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        slot_helper_review_requests: async (state) => {
          if (state.action === "update") {
            updatePayload = state.payload;
          }
          return { data: { ok: true }, error: null };
        },
        slot_helper_slot_holds: async (state) => {
          if (state.action === "update") {
            releasePayload = state.payload;
          }
          return { data: { ok: true }, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/slot-helper-review/complete", {
      method: "POST",
      body: JSON.stringify({ request_id: "req-1" }),
    });
    const res = await completePOST(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(updatePayload?.completed_at).toEqual(expect.any(String));
    expect(releasePayload?.released_at).toEqual(expect.any(String));
  });

  it("override: marks request overridden and releases holds", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    let updatePayload: any = null;
    let releasePayload: any = null;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        slot_helper_review_requests: async (state) => {
          if (state.action === "update") {
            updatePayload = state.payload;
          }
          return { data: { ok: true }, error: null };
        },
        slot_helper_slot_holds: async (state) => {
          if (state.action === "update") {
            releasePayload = state.payload;
          }
          return { data: { ok: true }, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/slot-helper-review/override", {
      method: "POST",
      body: JSON.stringify({ request_id: "req-1" }),
    });
    const res = await overridePOST(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(updatePayload?.overridden_at).toEqual(expect.any(String));
    expect(releasePayload?.released_at).toEqual(expect.any(String));
  });
});

