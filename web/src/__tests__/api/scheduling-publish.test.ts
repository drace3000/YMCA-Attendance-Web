import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/scheduling/publish/route";

vi.mock("@/lib/schedule-pdf-server", () => ({
  generateSchedulePdfBase64: vi.fn(async () => ({ pdfBase64: "Zg==", fileName: "schedule.pdf" })),
}));

vi.mock("@/lib/email-sender-with-attachments", () => ({
  sendEmailWithPdfAttachment: vi.fn(async () => ({ ok: true, messageId: "msg-1", recipientCount: 1 })),
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

describe("/api/scheduling/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 409 when schedule has HIGH conflicts", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({
          data: {
            id: "sch-1",
            name: "January 2026",
            month_start: "2026-01-01",
            status: "draft",
            published_at: null,
            branch_id: "br-1",
            program_group_id: "pg-1",
          },
          error: null,
        }),
        class_sessions: async () => ({
          data: [
            {
              id: "a",
              branch_id: "br-1",
              schedule_id: "sch-1",
              class_id: "cls-1",
              location_id: "loc-1",
              day_of_week: "THURSDAY",
              start_time: "08:00",
              end_time: "09:00",
              session_date: "2026-01-01",
              headcount: null,
              class: { id: "cls-1", name: "A" },
              location: { id: "loc-1", code: "STUDIO", name: "Studio" },
            },
            {
              id: "b",
              branch_id: "br-1",
              schedule_id: "sch-1",
              class_id: "cls-2",
              location_id: "loc-1", // same location
              day_of_week: "THURSDAY",
              start_time: "08:30", // overlap
              end_time: "09:30",
              session_date: "2026-01-01",
              headcount: null,
              class: { id: "cls-2", name: "B" },
              location: { id: "loc-1", code: "STUDIO", name: "Studio" },
            },
          ],
          error: null,
        }),
        session_instructors: async () => ({ data: [], error: null }),
        holidays: async () => ({ data: [], error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/publish", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", schedule_id: "sch-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toMatch(/Cannot publish/i);
    expect(json.summary.high).toBeGreaterThan(0);
    expect(Array.isArray(json.conflicts)).toBe(true);
  });

  it("returns 409 when schedule overlaps a closed holiday (HIGH)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({
          data: {
            id: "sch-1",
            name: "January 2026",
            month_start: "2026-01-01",
            status: "draft",
            published_at: null,
            branch_id: "br-1",
            program_group_id: "pg-1",
          },
          error: null,
        }),
        class_sessions: async () => ({
          data: [
            {
              id: "a",
              branch_id: "br-1",
              schedule_id: "sch-1",
              class_id: "cls-1",
              location_id: "loc-1",
              day_of_week: "THURSDAY",
              start_time: "08:00",
              end_time: "09:00",
              session_date: "2026-01-01",
              headcount: null,
              class: { id: "cls-1", name: "A" },
              location: { id: "loc-1", code: "STUDIO", name: "Studio" },
            },
          ],
          error: null,
        }),
        session_instructors: async () => ({ data: [], error: null }),
        instructor_availability: async () => ({ data: [], error: null }),
        holidays: async () => ({
          data: [
            {
              holiday_date: "2026-01-01",
              observed_date: null,
              name: "New Year's Day",
              is_closed: true,
              closed_start_time: null,
              closed_end_time: null,
              is_active: true,
            },
          ],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/publish", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", schedule_id: "sch-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.summary.high).toBeGreaterThan(0);
    expect(Array.isArray(json.conflicts)).toBe(true);
    expect(json.conflicts.some((c: any) => c.type === "HOLIDAY")).toBe(true);
  });

  it("publishes and emails when no HIGH conflicts exist", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1", email: "bm@example.com" },
    });

    let schedulesUpdateCalled = false;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async (state) => {
          if (state.action === "update") {
            schedulesUpdateCalled = true;
            return { data: { ok: true }, error: null };
          }
          return {
            data: {
              id: "sch-1",
              name: "January 2026",
              month_start: "2026-01-01",
              status: "draft",
              published_at: null,
              branch_id: "br-1",
              program_group_id: "pg-1",
            },
            error: null,
          };
        },
        class_sessions: async () => ({
          data: [
            {
              id: "sess-1",
              branch_id: "br-1",
              schedule_id: "sch-1",
              class_id: "cls-1",
              location_id: "loc-1",
              day_of_week: "THURSDAY",
              start_time: "08:00",
              end_time: "09:00",
              session_date: "2026-01-01",
              headcount: null,
              class: { id: "cls-1", name: "A" },
              location: { id: "loc-1", code: "STUDIO", name: "Studio" },
            },
          ],
          error: null,
        }),
        session_instructors: async () => ({
          data: [{ session_id: "sess-1", instructor_id: "inst-1" }],
          error: null,
        }),
        instructor_availability: async () => ({ data: [], error: null }),
        holidays: async () => ({ data: [], error: null }),
        instructors: async () => ({
          data: [
            {
              id: "inst-1",
              nickname: "AL",
              first_name: "A",
              last_name: "L",
              readable_id: null,
              auth_user_id: "auth-1",
            },
          ],
          error: null,
        }),
        ymca_branches: async () => ({
          data: {
            id: "br-1",
            name: "Eastside Family YMCA",
            website_url: null,
            theme_color: null,
            branch_manager_name: "Manager",
            branch_manager_email: "manager@example.com",
            schedule_email_from: null,
            schedule_email_reply_to: null,
            association: { name: "Association", alliance: { name: "Alliance" } },
          },
          error: null,
        }),
        program_groups: async () => ({
          data: { id: "pg-1", code: "GroupX", name: "Group X" },
          error: null,
        }),
        branch_schedule_recipients: async () => ({
          data: [{ auth_user_id: "auth-1", email: "inst1@example.com", is_active: true }],
          error: null,
        }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/publish", {
      method: "POST",
      body: JSON.stringify({ branch_id: "br-1", schedule_id: "sch-1" }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(schedulesUpdateCalled).toBe(true);
    expect(json.email.attempted).toBe(1);
  });
});


