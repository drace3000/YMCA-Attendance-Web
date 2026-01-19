import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/scheduling/clone/constraints-report/route";

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

describe("/api/scheduling/clone/constraints-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns title, org line, stats, and grouped rows", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedule_clone_audit: async () => ({
          data: {
            id: "audit-1",
            branch_id: "br-1",
            program_group_id: "pg-1",
            source_schedule_id: "sch-src",
            target_schedule_id: "sch-target",
            source_month_start: "2025-12-01",
            target_month_start: "2026-01-01",
            sessions_created_count: 10,
            sessions_skipped_count: 2,
          },
          error: null,
        }),
        ymca_branches: async () => ({
          data: {
            id: "br-1",
            name: "Eastside",
            association: { name: "Metro YMCA" },
          },
          error: null,
        }),
        schedule_clone_constraint_events: async () => ({
          data: [
            {
              id: "e1",
              audit_id: "audit-1",
              branch_id: "br-1",
              program_group_id: "pg-1",
              source_schedule_id: "sch-src",
              target_schedule_id: "sch-target",
              event_type: "SKIPPED_MISSING_OCCURRENCE",
              source_session_id: "sess-src-5",
              class_id: "cls-1",
              location_id: "loc-1",
              target_session_date: null,
              target_day_of_week: "MONDAY",
              target_start_time: "12:00",
              target_end_time: "13:00",
              details: { reason: "Missing weekday occurrence in target month" },
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          error: null,
        }),
        classes: async () => ({ data: [{ id: "cls-1", name: "Yoga" }], error: null }),
        locations: async () => ({ data: [{ id: "loc-1", code: "STUDIO", name: "Studio" }], error: null }),
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/scheduling/clone/constraints-report?branch_id=br-1&program_group_id=pg-1&target_schedule_id=sch-target",
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.title).toBe("Cloning January 2026 Schedule Exception Report");
    expect(json.org_line).toBe("Metro YMCA - Eastside");
    expect(json.stats).toMatchObject({ created_sessions: 10, skipped_sessions: 2, modified_sessions: 0 });

    expect(Array.isArray(json.groups)).toBe(true);
    expect(json.groups).toHaveLength(1);
    expect(json.groups[0]).toMatchObject({
      event_type: "SKIPPED_MISSING_OCCURRENCE",
      count: 1,
    });
    expect(json.groups[0].suggested_resolution).toContain("manually add");
    expect(json.groups[0].rows[0]).toMatchObject({
      source_session_id: "sess-src-5",
      target_day_of_week: "MONDAY",
      target_start_time: "12:00",
      target_end_time: "13:00",
      class: { id: "cls-1", name: "Yoga" },
      location: { id: "loc-1", code: "STUDIO", name: "Studio" },
    });
  });

  it("enriches dropped/kept instructor IDs in details for availability-related events", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedule_clone_audit: async () => ({
          data: {
            id: "audit-1",
            branch_id: "br-1",
            program_group_id: "pg-1",
            source_schedule_id: "sch-src",
            target_schedule_id: "sch-target",
            source_month_start: "2025-12-01",
            target_month_start: "2026-01-01",
            sessions_created_count: 1,
            sessions_skipped_count: 0,
          },
          error: null,
        }),
        ymca_branches: async () => ({
          data: { id: "br-1", name: "Eastside", association: { name: "Metro YMCA" } },
          error: null,
        }),
        schedule_clone_constraint_events: async () => ({
          data: [
            {
              id: "e2",
              audit_id: "audit-1",
              branch_id: "br-1",
              program_group_id: "pg-1",
              source_schedule_id: "sch-src",
              target_schedule_id: "sch-target",
              event_type: "MODIFIED_DROPPED_INSTRUCTORS",
              source_session_id: "sess-src-1",
              class_id: "cls-1",
              location_id: "loc-1",
              target_session_date: "2026-01-03",
              target_day_of_week: "SATURDAY",
              target_start_time: "07:15",
              target_end_time: "07:45",
              details: {
                reason: "Dropped unavailable instructors for target day/time",
                dropped_instructor_ids: ["inst-2"],
                kept_instructor_ids: ["inst-1"],
                original_instructor_ids: ["inst-1", "inst-2"],
              },
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          error: null,
        }),
        classes: async () => ({ data: [{ id: "cls-1", name: "Yoga" }], error: null }),
        locations: async () => ({ data: [{ id: "loc-1", code: "STUDIO", name: "Studio" }], error: null }),
        instructors: async () => ({
          data: [
            { id: "inst-1", nickname: "MIKEY", first_name: "John", last_name: "Smith", readable_id: "I001" },
            { id: "inst-2", nickname: "JENN W", first_name: "Jenn", last_name: "W", readable_id: "I002" },
          ],
          error: null,
        }),
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/scheduling/clone/constraints-report?branch_id=br-1&program_group_id=pg-1&target_schedule_id=sch-target",
    );
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.groups).toHaveLength(1);

    const row = json.groups[0].rows[0];
    expect(row.details.dropped_instructors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "inst-2", label: expect.stringContaining("JENN W") })]),
    );
    expect(row.details.kept_instructors).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "inst-1", label: expect.stringContaining("MIKEY") })]),
    );
  });
});

