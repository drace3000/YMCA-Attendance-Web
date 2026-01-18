import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/trends/route";

let mockSupabaseClient: any;
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockSupabaseClient,
}));

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

function createThenableQuery(result: any) {
  const q: any = {
    select: () => q,
    gte: () => q,
    lt: () => q,
    order: () => q,
    limit: () => q,
    eq: vi.fn(() => q),
    in: () => q,
    range: () => q,
    single: async () => result,
    maybeSingle: async () => result,
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return q;
}

describe("Phase X - /api/trends branch scoping (admin)", () => {
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
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  });

  it("applies branch_id filter when admin passes branch_id query param", async () => {
    const countQ = createThenableQuery({ count: 0, error: null });
    const pageQ = createThenableQuery({ data: [], error: null });

    mockSupabaseClient = {
      from: vi.fn(() =>
        createThenableQuery({ data: [], error: null, count: 0 }),
      ),
    };

    // First .from("class_sessions") is count, then pages
    mockSupabaseClient.from.mockImplementationOnce(() => countQ);
    mockSupabaseClient.from.mockImplementationOnce(() => pageQ);

    const req = new NextRequest("http://localhost:3000/api/trends?year=2025&branch_id=br-1");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(countQ.eq).toHaveBeenCalledWith("branch_id", "br-1");
    expect(pageQ.eq).toHaveBeenCalledWith("branch_id", "br-1");
  });
});

