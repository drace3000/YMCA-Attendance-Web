import { describe, expect, it, vi, beforeEach } from "vitest"

import { POST } from "@/app/api/email/welcome/route"

const mockSendEmail = vi.fn()
vi.mock("@/lib/email-sender", () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

vi.mock("@/lib/server-api-error", () => ({
  serverErrorResponse: async ({ publicMessage, status }: any) =>
    new Response(JSON.stringify({ error: publicMessage }), {
      status: status ?? 500,
      headers: { "Content-Type": "application/json" },
    }),
}))

describe("Phase 3b - POST /api/email/welcome", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 for invalid email", async () => {
    const req = new Request("http://localhost:3000/api/email/welcome", {
      method: "POST",
      body: JSON.stringify({ type: "welcome", to: "not-an-email", temp_password: "TempPass1" }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await POST(req as any)
    expect(res.status).toBe(400)
  })

  it("sends welcome email using shared sender", async () => {
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg-123" })

    const req = new Request("http://localhost:3000/api/email/welcome", {
      method: "POST",
      body: JSON.stringify({
        type: "welcome",
        to: "Manager@Example.com",
        first_name: "Test",
        assignment: {
          allianceName: "Alliance of New York State YMCAs",
          associationName: "YMCA of Greater Rochester",
          branchName: "Bay View Family YMCA",
        },
        temp_password: "TempPass1",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await POST(req as any)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.messageId).toBe("msg-123")

    expect(mockSendEmail).toHaveBeenCalledOnce()
    const call = mockSendEmail.mock.calls[0][0]
    expect(call.to).toEqual(["manager@example.com"])
    expect(call.subject).toMatch(/welcome/i)
    expect(call.text).toContain("Alliance:")
    expect(call.text).toContain("Association:")
    expect(call.text).toContain("Branch:")
  })

  it("returns server error if sender fails", async () => {
    mockSendEmail.mockResolvedValue({ ok: false, reason: "send_failed", message: "boom" })

    const req = new Request("http://localhost:3000/api/email/welcome", {
      method: "POST",
      body: JSON.stringify({
        type: "password_reset",
        to: "Manager@Example.com",
        first_name: "Test",
        temp_password: "TempPass1",
      }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await POST(req as any)
    expect(res.status).toBe(502)
  })
})

