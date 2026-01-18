import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/scheduling/instructor-class-location-details/route";

type MockQueryState = {
  table: string;
  action: "select";
  filters: Array<{ op: "eq"; column: string; value: unknown }>;
};

type MockHandlerResult = { data: any; error: any };
type MockTableHandler = (state: MockQueryState) => Promise<MockHandlerResult> | MockHandlerResult;

function createMockSupabaseClient(handlers: Record<string, MockTableHandler>) {
  function makeBuilder(table: string) {
    const state: MockQueryState = {
      table,
      action: "select",
      filters: [],
    };

    const builder: any = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ op: "eq", column, value });
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

describe("GET /api/scheduling/instructor-class-location-details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes to the branch user branch_id (ignores requested branch_id)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructor_class_location_details: async (state) => {
          expect(state.action).toBe("select");
          expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: "br-1" });
          return {
            data: [
              {
                class_id: "c1",
                class_name: "UPBEAT BARRE™",
                instructor_id: "i1",
                instructor_nickname: "MIKEY",
                location_id: "l1",
                location_name: "Room A",
                minutes: 60,
              },
              {
                class_id: "c1",
                class_name: "UPBEAT BARRE™",
                instructor_id: "i2",
                instructor_nickname: "ANA",
                location_id: "l1",
                location_name: "Room A",
                minutes: 60,
              },
            ],
            error: null,
          };
        },
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/scheduling/instructor-class-location-details?branch_id=br-2",
    );
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({
      rows: [
        {
          class_id: "c1",
          class_name: "UPBEAT BARRE™",
          class_label: "UPBEAT BARRE™",
          instructor_id: "i1",
          instructor_nickname: "MIKEY",
          instructor_label: "MIKEY",
          location_id: "l1",
          location_name: "Room A",
          location_label: "Room A",
          minutes: 60,
        },
        {
          class_id: "c1",
          class_name: "UPBEAT BARRE™",
          class_label: "UPBEAT BARRE™",
          instructor_id: "i2",
          instructor_nickname: "ANA",
          instructor_label: "ANA",
          location_id: "l1",
          location_name: "Room A",
          location_label: "Room A",
          minutes: 60,
        },
      ],
    });
  });

  it("requires branch_id in dev passthrough mode", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: null,
      devPassthrough: true,
    });

    const req = new NextRequest("http://localhost:3000/api/scheduling/instructor-class-location-details");
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "branch_id is required" });
  });
});


