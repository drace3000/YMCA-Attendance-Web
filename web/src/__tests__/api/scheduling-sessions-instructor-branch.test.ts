import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST, PUT } from "@/app/api/scheduling/sessions/route";

let mockSupabaseClient: any;
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}));

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

describe("Phase X - /api/scheduling/sessions instructor-branch validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRecipientAccess.mockResolvedValue({
      ok: true,
      response: null,
      access: {
        recipient_type: "Administrator",
        branch_id: "br-admin",
        association_id: "as-admin",
        alliance_id: "al-admin",
      },
    });
  });

  it("POST returns 409 when an instructor is not available for the branch", async () => {
    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "locations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "loc-1" }, error: null }),
                }),
              }),
            }),
          };
        }

        if (table === "instructors") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: "inst-ok", branch_id: "br-1" }], // owned to different branch
                error: null,
              }),
            }),
          };
        }

        if (table === "instructor_branches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [], // not linked
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "class_sessions") {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "sess-1" }, error: null }),
              }),
            }),
          };
        }

        if (table === "session_instructors") {
          return {
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        return {};
      }),
    };

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
        session_date: "2026-01-01",
        instructor_ids: ["inst-bad"],
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("instructor");
  });

  it("PUT returns 409 when updated instructor list includes out-of-scope instructor", async () => {
    mockSupabaseClient = {
      from: vi.fn((table: string) => {
        if (table === "class_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { branch_id: "br-1" }, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          };
        }

        if (table === "instructors") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          };
        }

        if (table === "instructor_branches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "session_instructors") {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }

        return {};
      }),
    };

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "PUT",
      body: JSON.stringify({
        id: "sess-1",
        instructor_ids: ["inst-bad"],
      }),
    });

    const res = await PUT(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("instructor");
  });
});

