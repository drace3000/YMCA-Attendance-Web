import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRecipientAccess } from "@/lib/requireRecipientAccess";

const mockCreateSupabaseAuthRouteClient = vi.fn();
vi.mock("@/lib/supabaseAuthRouteClient", () => ({
  createSupabaseAuthRouteClient: (...args: unknown[]) => mockCreateSupabaseAuthRouteClient(...args),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

type RecipientRow = {
  id: string;
  email: string;
  recipient_type: "Administrator" | "Branch" | "Member" | "Normal";
  is_active: boolean;
  needs_password_setup: boolean;
  last_login_at: string | null;
  branch_id: string;
  branch: {
    id: string;
    name: string;
    association_id: string | null;
    association: { id: string; alliance_id: string | null } | null;
  } | null;
};

function createRecipientQuery(row: RecipientRow | null) {
  const q: any = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return q;
}

describe("requireRecipientAccess bearer fallback (pilot)", () => {
  it("accepts Authorization: Bearer token when cookie auth is missing", async () => {
    mockCreateSupabaseAuthRouteClient.mockReturnValue({
      auth: {
        getUser: async () => ({ data: { user: null }, error: new Error("no cookie session") }),
      },
    });

    const supabaseMock = {
      auth: {
        getUser: async (token: string) => {
          expect(token).toBe("test-access-token");
          return { data: { user: { email: "manager@ymca.org" } }, error: null };
        },
      },
      from: (table: string) => {
        expect(table).toBe("branch_schedule_recipients");
        return createRecipientQuery({
          id: "r-1",
          email: "manager@ymca.org",
          recipient_type: "Branch",
          is_active: true,
          needs_password_setup: false,
          last_login_at: null,
          branch_id: "br-1",
          branch: {
            id: "br-1",
            name: "Eastside Family YMCA",
            association_id: null,
            association: null,
          },
        });
      },
    };
    mockCreateSupabaseServerClient.mockReturnValue(supabaseMock);

    const req = new NextRequest("http://localhost:3000/api/maintenance/instructors", {
      headers: {
        Authorization: "Bearer test-access-token",
      },
    });

    const result = await requireRecipientAccess(req);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    if (!("access" in result)) throw new Error("expected access result");
    expect(result.access?.email).toBe("manager@ymca.org");
    expect(result.access?.branch_id).toBe("br-1");
  });
});

