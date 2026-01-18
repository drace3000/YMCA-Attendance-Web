import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, PATCH, PUT } from "@/app/api/maintenance/instructors/route";

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

let mockSupabaseClient: any;
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}));

function createThenableQuery(result: { data: any; error: any }) {
  const q: any = {
    select: () => q,
    returns: () => q,
    eq: () => q,
    ilike: () => q,
    in: () => q,
    order: () => q,
    update: () => q,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

function createSupabaseMock(queues: Record<string, any[]>) {
  return {
    from: vi.fn((table: string) => {
      const next = queues[table]?.shift();
      return next ?? createThenableQuery({ data: [], error: null });
    }),
  };
}

describe("Phase X - /api/maintenance/instructors branch scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRecipientAccess.mockResolvedValue({
      ok: true,
      response: null,
      access: {
        recipient_type: "Branch",
        branch_id: "br-user",
        association_id: "as-user",
        alliance_id: "al-user",
      },
    });
  });

  it("GET: Branch user ignores requested branch_id and scopes to their branch (instructor_branches + instructors owned)", async () => {
    mockSupabaseClient = createSupabaseMock({
      instructor_branches: [
        createThenableQuery({
          data: [{ instructor_id: "inst-linked" }],
          error: null,
        }),
        createThenableQuery({
          data: [
            { instructor_id: "inst-owned", branch_id: "br-user", is_primary: true },
            { instructor_id: "inst-linked", branch_id: "br-other", is_primary: true },
            { instructor_id: "inst-linked", branch_id: "br-user", is_primary: false },
          ],
          error: null,
        }),
      ],
      instructors: [
        createThenableQuery({
          data: [{ id: "inst-owned", nickname: "A", branch_id: "br-user" }],
          error: null,
        }),
        createThenableQuery({
          data: [{ id: "inst-linked", nickname: "B", branch_id: "br-other" }],
          error: null,
        }),
      ],
    });

    const req = new NextRequest(
      "http://localhost:3000/api/maintenance/instructors?branch_id=br-spoofed"
    );
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    // Should contain both owned + linked
    expect(data.map((r: any) => r.id).sort()).toEqual(["inst-linked", "inst-owned"].sort());
    // Should also include available_branches for each instructor
    const owned = data.find((r: any) => r.id === "inst-owned");
    expect(Array.isArray(owned?.available_branches)).toBe(true);
  });

  it("GET: Admin must provide branch_id", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: {
        recipient_type: "Administrator",
        branch_id: "br-admin",
        association_id: "as-admin",
        alliance_id: "al-admin",
      },
    });

    mockSupabaseClient = createSupabaseMock({
      instructor_branches: [
        createThenableQuery({ data: [], error: null }), // linkedRows (no linked ids)
        createThenableQuery({ data: [], error: null }), // branchLinks for merged ids
      ],
      instructors: [createThenableQuery({ data: [], error: null })],
    });

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json)).toBe(true);
  });

  it("GET: returns 400 when branch_id is missing and no fallback branch exists", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: {
        recipient_type: "Administrator",
        branch_id: null,
        association_id: "as-admin",
        alliance_id: "al-admin",
      },
    });

    mockSupabaseClient = createSupabaseMock({});

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(String(json.error)).toContain("branch_id");
  });

  it("PUT: Branch user cannot update an instructor that is neither owned nor linked", async () => {
    const instructors = createThenableQuery({ data: [], error: null });
    instructors.single = async () => ({
      data: { id: "inst-1", branch_id: "br-other", nickname: "X", first_name: "F", last_name: "L" },
      error: null,
    });
    const links = createThenableQuery({ data: [], error: null });
    links.maybeSingle = async () => ({ data: null, error: null });

    mockSupabaseClient = createSupabaseMock({
      instructors: [instructors],
      instructor_branches: [links],
    });

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors", {
      method: "PUT",
      body: JSON.stringify({ id: "inst-1", nickname: "NEW" }),
    });
    const res = await PUT(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain("Forbidden");
  });

  it("PATCH: Branch user cannot toggle an instructor that is neither owned nor linked", async () => {
    const instructors = createThenableQuery({ data: [], error: null });
    instructors.single = async () => ({
      data: { id: "inst-1", branch_id: "br-other" },
      error: null,
    });

    const links = createThenableQuery({ data: [], error: null });
    links.maybeSingle = async () => ({ data: null, error: null });

    mockSupabaseClient = createSupabaseMock({
      instructors: [instructors, createThenableQuery({ data: [], error: null })],
      instructor_branches: [links],
    });

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors", {
      method: "PATCH",
      body: JSON.stringify({ id: "inst-1", is_active: false }),
    });
    const res = await PATCH(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toContain("Forbidden");
  });
});


