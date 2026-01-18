import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST as sendPOST } from "@/app/api/scheduling/reschedule-feedback/send/route";
import { GET as statusGET } from "@/app/api/scheduling/reschedule-feedback/status/route";
import { GET as requestGET } from "@/app/api/scheduling/reschedule-feedback/request/route";
import { POST as submitPOST } from "@/app/api/scheduling/reschedule-feedback/submit/route";

vi.mock("@/lib/email-sender", () => ({
  sendEmail: vi.fn(async () => ({ ok: true, messageId: "msg-1" })),
}));

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "update";
  payload?: unknown;
  filters: Array<{ op: "eq"; column: string; value: unknown }>;
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

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

describe("/api/scheduling/reschedule-feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("send: creates request + sends email (falls back to don.race@outlook.com when no instructor email)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-admin", email: "admin@example.com" },
    });

    let insertedRequestToken: string | null = null;
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({
          data: { id: "sch-1", name: "December 2025", month_start: "2025-12-01", branch_id: "br-1" },
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
        schedule_reschedule_requests: async (state) => {
          if (state.action !== "insert") return { data: null, error: null };
          const payload: any = state.payload;
          insertedRequestToken = String(payload?.request_token ?? "");
          return { data: { id: "req-1", created_at: "2026-01-15T00:00:00Z", expires_at: "2026-01-17T00:00:00Z" }, error: null };
        },
        schedule_reschedule_email_log: async () => ({ data: { ok: true }, error: null }),
        branch_schedule_recipients: async () => ({ data: null, error: null }),
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/reschedule-feedback/send?branch_id=br-1", {
      method: "POST",
      body: JSON.stringify({
        schedule_id: "sch-1",
        instructor_id: "inst-1",
        request_payload: { rows: [] },
      }),
    });

    const res = await sendPOST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.email.to).toEqual(["don.race@outlook.com"]);
    expect(insertedRequestToken).toBeTruthy();
  });

  it("send: sends to primary + additional_emails when provided", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-admin", email: "admin@example.com" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({
          data: { id: "sch-1", name: "December 2025", month_start: "2025-12-01", branch_id: "br-1" },
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
        schedule_reschedule_requests: async (state) => {
          if (state.action !== "insert") return { data: null, error: null };
          return { data: { id: "req-1", created_at: "2026-01-15T00:00:00Z", expires_at: "2026-01-17T00:00:00Z" }, error: null };
        },
        schedule_reschedule_email_log: async (state) => {
          if (state.action !== "insert") return { data: null, error: null };
          const payload: any = state.payload;
          expect(String(payload?.to_email ?? "")).toContain("don.race@outlook.com");
          expect(String(payload?.to_email ?? "")).toContain("alt@example.com");
          return { data: { ok: true }, error: null };
        },
        branch_schedule_recipients: async () => ({ data: null, error: null }),
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/reschedule-feedback/send?branch_id=br-1", {
      method: "POST",
      body: JSON.stringify({
        schedule_id: "sch-1",
        instructor_id: "inst-1",
        request_payload: { rows: [] },
        additional_emails: ["alt@example.com"],
      }),
    });

    const res = await sendPOST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.email.to).toEqual(["don.race@outlook.com", "alt@example.com"]);
  });

  it("status: returns latest email log + latest request", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedule_reschedule_email_log: async () => ({
          data: [{ sent_at: "2026-01-15T00:00:00Z", from_email: "x", to_email: "y", subject: "s", message_id: "m" }],
          error: null,
        }),
        schedule_reschedule_requests: async () => ({
          data: [{ id: "req-1", created_at: "2026-01-15T00:00:00Z", expires_at: "2026-01-17T00:00:00Z", responded_at: null, response_selected_session_ids: [] }],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/reschedule-feedback/status?branch_id=br-1&schedule_id=sch-1&instructor_id=inst-1");
    const res = await statusGET(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.email).toBeTruthy();
    expect(json.request).toBeTruthy();
  });

  it("request: returns expired=true when expires_at is in the past", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedule_reschedule_requests: async () => ({
          data: {
            id: "req-1",
            branch_id: "br-1",
            schedule_id: "sch-1",
            instructor_id: "inst-1",
            request_payload: { rows: [] },
            created_at: "2026-01-01T00:00:00Z",
            expires_at: "2026-01-01T00:00:00Z",
            responded_at: null,
            response_selected_session_ids: [],
          },
          error: null,
        }),
        ymca_branches: async () => ({ data: { id: "br-1", name: "Branch" }, error: null }),
        schedules: async () => ({ data: { id: "sch-1", name: "Schedule" }, error: null }),
        instructors: async () => ({ data: { id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M" }, error: null }),
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/reschedule-feedback/request?t=tok");
    const res = await requestGET(req as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.expired).toBe(true);
  });

  it("submit: rejects when expired", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedule_reschedule_requests: async () => ({
          data: {
            id: "req-1",
            branch_id: "br-1",
            schedule_id: "sch-1",
            instructor_id: "inst-1",
            request_payload: { rows: [] },
            expires_at: "2026-01-01T00:00:00Z",
          },
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost/api/scheduling/reschedule-feedback/submit", {
      method: "POST",
      body: JSON.stringify({ t: "tok", selected_session_ids: [] }),
    });
    const res = await submitPOST(req as any);
    expect(res.status).toBe(410);
  });
});


