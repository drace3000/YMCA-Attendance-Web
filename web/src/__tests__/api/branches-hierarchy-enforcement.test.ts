import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PATCH } from "@/app/api/branches/[id]/route";

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

let mockSupabaseClient: any;
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}));

function makeThenableUpdate(result: { data: any; error: any }) {
  const builder: any = {
    update: () => builder,
    eq: () => builder,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("/api/branches/[id] hierarchy enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient = null;
  });

  it("GET: blocks Branch users from fetching a different branch (prevents hierarchy spoof)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    // If the route incorrectly queries Supabase, we'd rather fail loudly.
    mockSupabaseClient = { from: vi.fn() };

    const res = await GET(
      new Request("http://localhost:3000/api/branches/br-other"),
      { params: Promise.resolve({ id: "br-other" }) },
    );

    expect(res.status).toBe(403);
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });

  it("GET: allows Branch users to fetch their own branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    mockSupabaseClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "br-allowed",
                code: "eastside",
                short_code: null,
                name: "Eastside Family YMCA",
                association: {
                  id: "as-1",
                  name: "YMCA Of Greater Rochester",
                  code: "rochester",
                  alliance: {
                    id: "al-1",
                    name: "Alliance Of New York State YMCAs",
                    code: "nys",
                  },
                },
              },
              error: null,
            }),
          }),
        }),
      })),
    };

    const res = await GET(
      new Request("http://localhost:3000/api/branches/br-allowed"),
      { params: Promise.resolve({ id: "br-allowed" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("br-allowed");
    expect(json.alliance_name).toContain("Alliance");
  });

  it("PATCH: blocks Branch users from updating a different branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    mockSupabaseClient = { from: vi.fn() };

    const res = await PATCH(
      new Request("http://localhost:3000/api/branches/br-other", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_manager_name: "Hacker" }),
      }),
      { params: Promise.resolve({ id: "br-other" }) },
    );

    expect(res.status).toBe(403);
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });

  it("PATCH: allows Branch users to update their own branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    mockSupabaseClient = {
      from: vi.fn(() => makeThenableUpdate({ data: null, error: null })),
    };

    const res = await PATCH(
      new Request("http://localhost:3000/api/branches/br-allowed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_manager_name: "New Name" }),
      }),
      { params: Promise.resolve({ id: "br-allowed" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("PATCH: rejects availability time range when only one value is provided", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    mockSupabaseClient = { from: vi.fn() };

    const res = await PATCH(
      new Request("http://localhost:3000/api/branches/br-allowed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability_time_start: "06:00" }),
      }),
      { params: Promise.resolve({ id: "br-allowed" }) },
    );

    expect(res.status).toBe(400);
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });

  it("PATCH: rejects availability time range when end <= start", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    mockSupabaseClient = { from: vi.fn() };

    const res = await PATCH(
      new Request("http://localhost:3000/api/branches/br-allowed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability_time_start: "23:00", availability_time_end: "06:00" }),
      }),
      { params: Promise.resolve({ id: "br-allowed" }) },
    );

    expect(res.status).toBe(400);
    expect(mockSupabaseClient.from).not.toHaveBeenCalled();
  });

  it("PATCH: allows updating availability time range with valid values", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: { recipient_type: "Branch", branch_id: "br-allowed" },
    });

    const builder: any = {
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      then: (resolve: any, reject: any) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
    };

    mockSupabaseClient = {
      from: vi.fn(() => builder),
    };

    const res = await PATCH(
      new Request("http://localhost:3000/api/branches/br-allowed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }),
      }),
      { params: Promise.resolve({ id: "br-allowed" }) },
    );

    expect(res.status).toBe(200);
    expect(mockSupabaseClient.from).toHaveBeenCalledWith("ymca_branches");
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        availability_time_start: "06:00",
        availability_time_end: "23:00",
      }),
    );
  });
});

