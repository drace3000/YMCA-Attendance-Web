import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { DELETE, GET, POST } from "@/app/api/scheduling/instructor-class-location-details/route";

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "delete" | "upsert";
  filters: Array<{ op: "eq" | "ilike"; column: string; value: unknown }>;
  payload?: unknown;
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
      single: () => builder,
      limit: () => builder,
      insert: (payload: unknown) => {
        state.action = "insert";
        state.payload = payload;
        return builder;
      },
      delete: () => {
        state.action = "delete";
        return builder;
      },
      upsert: (payload: unknown) => {
        state.action = "upsert";
        state.payload = payload;
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
                id: "m1",
                class_id: "c1",
                class_name: "UPBEAT BARRE™",
                instructor_id: "i1",
                instructor_nickname: "MIKEY",
                location_id: "l1",
                location_name: "Room A",
                minutes: 60,
              },
              {
                id: "m2",
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
          id: "m1",
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
          id: "m2",
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
      placeholder_instructor_id: null,
      placeholder_instructor_nickname: null,
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

  it("filters to class-only mappings when class_only is true", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructors: async (state) => {
          expect(state.action).toBe("select");
          expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: "br-1" });
          return { data: [{ id: "ph-1", nickname: "UNASSIGNED" }], error: null };
        },
        instructor_class_location_details: async (state) => {
          expect(state.filters).toContainEqual({ op: "eq", column: "class_id", value: "c1" });
          expect(state.filters).toContainEqual({ op: "eq", column: "instructor_id", value: "ph-1" });
          return {
            data: [
              {
                id: "m3",
                class_id: "c1",
                class_name: "ACTIVE YOGA",
                instructor_id: "ph-1",
                instructor_nickname: "UNASSIGNED",
                location_id: "l1",
                location_name: "Studio",
                minutes: 45,
              },
            ],
            error: null,
          };
        },
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/scheduling/instructor-class-location-details?branch_id=br-1&class_id=c1&class_only=true",
    );
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.placeholder_instructor_id).toBe("ph-1");
    expect(json.rows).toHaveLength(1);
  });
});

describe("POST/DELETE /api/scheduling/instructor-class-location-details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates class mappings using placeholder instructor", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructors: async () => ({ data: [{ id: "ph-1", nickname: "UNASSIGNED" }], error: null }),
        instructor_class_location_details: async (state) => {
          if (state.action === "insert") {
            const payload = state.payload as Array<{ instructor_id: string }>;
            expect(payload[0].instructor_id).toBe("ph-1");
            return { data: [{ id: "new-1" }], error: null };
          }
          return { data: [], error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/scheduling/instructor-class-location-details", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        class_id: "c1",
        class_name: "ACTIVE YOGA",
        items: [{ location_id: "l1", location_name: "Studio", minutes: 45 }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("deletes only placeholder mappings by id", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructors: async () => ({ data: [{ id: "ph-1", nickname: "UNASSIGNED" }], error: null }),
        instructor_class_location_details: async (state) => {
          expect(state.action).toBe("delete");
          expect(state.filters).toContainEqual({ op: "eq", column: "instructor_id", value: "ph-1" });
          expect(state.filters).toContainEqual({ op: "eq", column: "id", value: "m1" });
          return { data: [{ id: "m1" }], error: null };
        },
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/scheduling/instructor-class-location-details?id=m1&branch_id=br-1",
      { method: "DELETE" },
    );
    const res = await DELETE(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deleted).toBe(1);
  });

  it("deletes all mappings for class duration when scope=all", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-1" },
    });

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructor_class_location_details: async (state) => {
          expect(state.action).toBe("delete");
          expect(state.filters).toContainEqual({ op: "eq", column: "branch_id", value: "br-1" });
          expect(state.filters).toContainEqual({ op: "eq", column: "class_id", value: "c1" });
          expect(state.filters).toContainEqual({ op: "eq", column: "minutes", value: 60 });
          expect(state.filters.some((f) => f.column === "instructor_id")).toBe(false);
          return { data: [{ id: "m1" }, { id: "m2" }], error: null };
        },
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/scheduling/instructor-class-location-details?branch_id=br-1&class_id=c1&minutes=60&scope=all",
      { method: "DELETE" },
    );
    const res = await DELETE(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deleted).toBe(2);
  });
});


