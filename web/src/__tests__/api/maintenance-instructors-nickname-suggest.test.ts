import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST, PUT } from "@/app/api/maintenance/instructors/route";

type MockQueryState = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: unknown;
  filters: Array<{ op: "eq" | "ilike" | "neq" | "in" | "is"; column: string; value: unknown }>;
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
      neq: (column: string, value: unknown) => {
        state.filters.push({ op: "neq", column, value });
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

vi.mock("@/lib/icld-auto-backfill", () => ({
  autoBackfillIcldForInstructorInBranch: vi.fn(async () => undefined),
}));

describe("/api/maintenance/instructors nickname suggest + sanitize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRecipientAccess.mockResolvedValue({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    });
  });

  it("GET suggest_nicknames returns letters-only suggestions (no digits) and up to 5", async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructor_branches: async () => ({ data: [], error: null }),
        instructors: async () => ({
          // Existing nickname that should be treated as taken
          data: [{ nickname: "JOHNDOE" }],
          error: null,
        }),
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/maintenance/instructors?suggest_nicknames=true&first_name=Jo3hn!&last_name=D0e&branch_id=br-1",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.suggestions)).toBe(true);
    expect(json.suggestions.length).toBeGreaterThan(0);
    expect(json.suggestions.length).toBeLessThanOrEqual(5);

    for (const s of json.suggestions) {
      expect(typeof s).toBe("string");
      expect(s).toMatch(/^[A-Z]{2,8}$/);
    }
  });

  it("GET check_nickname sanitizes digits and detects duplicates", async () => {
    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructor_branches: async () => ({ data: [], error: null }),
        instructors: async () => ({
          data: [{ nickname: "JOHN" }],
          error: null,
        }),
      }),
    );

    const req = new NextRequest(
      "http://localhost:3000/api/maintenance/instructors?check_nickname=joHN123&first_name=John&last_name=Doe&branch_id=br-1",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.exists).toBe(true);
    expect(Array.isArray(json.suggestions)).toBe(true);
    expect(json.suggestions.length).toBeLessThanOrEqual(5);
  });

  it("PUT rejects nickname changes after creation", async () => {
    let updateCalled = false;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructors: async (state) => {
          if (state.action === "select" && state.wantSingle) {
            return {
              data: { id: "inst-1", branch_id: "br-1", nickname: "JOHN", first_name: "John", last_name: "Doe" },
              error: null,
            };
          }
          if (state.action === "update") {
            updateCalled = true;
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        instructor_branches: async () => ({ data: { instructor_id: "inst-1" }, error: null }),
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors", {
      method: "PUT",
      body: JSON.stringify({ id: "inst-1", nickname: "NEWW" }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(String(json.error ?? "")).toMatch(/Nickname cannot be changed/i);
    expect(updateCalled).toBe(false);
  });

  it("POST sanitizes nickname (letters-only) and generates readable_id ASSOC-BRANCHSHORT-NICKNAME", async () => {
    let insertedInstructor: any | null = null;

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        instructor_branches: async (state) => {
          if (state.action === "select") {
            // linked instructors scope for uniqueness
            return { data: [], error: null };
          }
          if (state.action === "upsert") {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        instructors: async (state) => {
          if (state.action === "select") {
            // nickname scope + readable_id collision check
            if (state.filters.some((f) => f.column === "branch_id")) {
              return { data: [], error: null };
            }
            if (state.filters.some((f) => f.column === "readable_id")) {
              return { data: [], error: null };
            }
            return { data: [], error: null };
          }
          if (state.action === "insert") {
            insertedInstructor = state.payload;
            return {
              data: {
                id: "inst-new",
                nickname: (state.payload as any)?.nickname ?? null,
                first_name: (state.payload as any)?.first_name ?? null,
                last_name: (state.payload as any)?.last_name ?? null,
                readable_id: (state.payload as any)?.readable_id ?? null,
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        ymca_branches: async (state) => {
          if (state.action === "select" && state.wantSingle) {
            return {
              data: {
                id: "br-1",
                short_code: "ES",
                association: { code: "GROC" },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      }),
    );

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        first_name: "John",
        last_name: "Doe",
        nickname: "jo-hn123",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.readable_id).toBe("GROC-ES-JOHN");
    expect(json.nickname).toBe("JOHN");

    // Ensure server inserted sanitized nickname + correct readable_id
    expect(insertedInstructor).not.toBeNull();
    expect(insertedInstructor.nickname).toBe("JOHN");
    expect(insertedInstructor.readable_id).toBe("GROC-ES-JOHN");
  });
});

