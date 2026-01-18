import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockRequireRecipientAccess = vi.fn();
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

// Only used in one test; safe to have a minimal OpenAI mock.
const mockOpenAiCreate = vi.fn();
vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = { completions: { create: (...args: any[]) => mockOpenAiCreate(...args) } };
      constructor(_opts: any) {}
    },
  };
});

import { POST } from "@/app/api/data-mining/route";

describe("NLQ - /api/data-mining server-side branch enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.AI_MODEL;
    delete process.env.ANTHROPIC_API_KEY;

    mockCreateSupabaseServerClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          success: true,
          error: null,
          data: [],
          row_count: 0,
          execution_time_ms: 1,
        },
        error: null,
      }),
    });

    // Default: return branch-scoped SQL so the API executes and we can assert enforced branch_id.
    mockOpenAiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              sql: "select 1 as one where 'x' = 'x' and :branch_id is not null",
              explanation: "test",
              resultFormat: "single_value",
              reportTitle: "Test",
              summary: "Test",
            }),
          },
        },
      ],
    });
  });

  it("forces Branch users to their assigned branch_id (ignores spoofed branchId)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: {
        recipient_type: "Branch",
        branch_id: "br-assigned",
        association_id: "as-1",
        alliance_id: "al-1",
      },
    });

    const req = new NextRequest("http://localhost:3000/api/data-mining", {
      method: "POST",
      body: JSON.stringify({
        query: "Show average attendance by class.",
        branchId: "br-spoofed",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const supabase = mockCreateSupabaseServerClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      "execute_readonly_sql",
      expect.objectContaining({
        p_branch_id: "br-assigned",
      }),
    );
  });

  it("allows Admins to choose the branch_id via request body", async () => {
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

    const req = new NextRequest("http://localhost:3000/api/data-mining", {
      method: "POST",
      body: JSON.stringify({
        query: "Show average attendance by class.",
        branchId: "br-selected",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const supabase = mockCreateSupabaseServerClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      "execute_readonly_sql",
      expect.objectContaining({
        p_branch_id: "br-selected",
      }),
    );
  });

  it("rejects requests when Admin does not supply branchId (branch scoping required)", async () => {
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

    const req = new NextRequest("http://localhost:3000/api/data-mining", {
      method: "POST",
      body: JSON.stringify({
        query: "Show average attendance by class.",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.success).toBe(false);
    expect(String(payload.error)).toMatch(/branchId is required/i);
  });

  it("refuses to execute SQL that does not contain :branch_id placeholder", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: {
        recipient_type: "Branch",
        branch_id: "br-assigned",
        association_id: "as-1",
        alliance_id: "al-1",
      },
    });

    // Intentionally missing :branch_id twice (original + retry) to ensure we still refuse to execute.
    mockOpenAiCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sql: "select 1 as one",
                explanation: "test",
                resultFormat: "single_value",
                reportTitle: "Test",
                summary: "Test",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sql: "select 2 as two",
                explanation: "test",
                resultFormat: "single_value",
                reportTitle: "Test",
                summary: "Test",
              }),
            },
          },
        ],
      });

    const req = new NextRequest("http://localhost:3000/api/data-mining", {
      method: "POST",
      body: JSON.stringify({
        query: "Return 1",
        branchId: "br-spoofed",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.success).toBe(false);
    expect(String(payload.error)).toMatch(/:branch_id/i);

    expect(mockCreateSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("retries once to add :branch_id and executes when the retry includes it", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      response: null,
      access: {
        recipient_type: "Branch",
        branch_id: "br-assigned",
        association_id: "as-1",
        alliance_id: "al-1",
      },
    });

    // First AI response lacks :branch_id, retry includes it.
    mockOpenAiCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sql: "select 1 as one",
                explanation: "test",
                resultFormat: "single_value",
                reportTitle: "Test",
                summary: "Test",
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sql: "select 1 as one where :branch_id is not null",
                explanation: "test",
                resultFormat: "single_value",
                reportTitle: "Test",
                summary: "Test",
              }),
            },
          },
        ],
      });

    const req = new NextRequest("http://localhost:3000/api/data-mining", {
      method: "POST",
      body: JSON.stringify({
        query: "Return 1",
        branchId: "br-spoofed",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const payload = await res.json();
    expect(payload.success).toBe(true);

    const supabase = mockCreateSupabaseServerClient.mock.results[0]?.value;
    expect(supabase.rpc).toHaveBeenCalledWith(
      "execute_readonly_sql",
      expect.objectContaining({
        p_branch_id: "br-assigned",
      }),
    );
  });
});


