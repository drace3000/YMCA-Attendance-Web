import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

import { RecipientsTab } from "@/app/maintenance/recipients-tab"

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    branch: { id: "br-1", name: "Bay View Family YMCA" },
  }),
}))

type FetchResponse = {
  ok: boolean
  status?: number
  json: () => Promise<any>
}

function mockJson(ok: boolean, data: any, status = 200): FetchResponse {
  return {
    ok,
    status,
    json: async () => data,
  }
}

describe("Phase 4 - RecipientsTab (Admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("loads org + recipients for default branch and renders table rows", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/maintenance/organization")) {
        return mockJson(true, {
          alliances: [{ id: "a1", code: "NY", name: "Alliance of New York State YMCAs" }],
          associations: [{ id: "as1", code: "GROC", name: "YMCA of Greater Rochester", alliance_id: "a1" }],
          branches: [{ id: "br-1", code: "BAYVIEWFAM", short_code: "BAYVIEW", name: "Bay View Family YMCA", association_id: "as1" }],
        })
      }
      if (url.includes("/api/maintenance/recipients?branch_id=br-1")) {
        return mockJson(true, [
          {
            id: "r1",
            branch_id: "br-1",
            email: "manager@ymca.org",
            first_name: "Branch",
            last_name: "Manager",
            phone: null,
            address: null,
            city: null,
            state: null,
            zip_code: null,
            on_hold: false,
            recipient_type: "Branch",
            created_at: "2026-01-01T00:00:00Z",
            auth_user_id: "u1",
            is_active: true,
            needs_password_setup: true,
            last_login_at: null,
          },
        ])
      }
      return mockJson(false, { error: "not found" }, 404)
    })

    vi.stubGlobal("fetch", fetchMock as any)

    render(<RecipientsTab />)

    // Row appears after org + recipients load
    expect(await screen.findByText("manager@ymca.org")).toBeInTheDocument()
    expect(screen.getByText(/pending password change/i)).toBeInTheDocument()
  })

  it("filters associations + branches based on Alliance selection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/maintenance/organization")) {
        return mockJson(true, {
          alliances: [
            { id: "a1", code: "NY", name: "Alliance of New York State YMCAs" },
            { id: "a2", code: "PA", name: "Alliance of Pennsylvania YMCAs" },
          ],
          associations: [
            { id: "as1", code: "GROC", name: "YMCA of Greater Rochester", alliance_id: "a1" },
            { id: "as2", code: "PHL", name: "YMCA of Greater Philadelphia", alliance_id: "a2" },
          ],
          branches: [
            { id: "br-1", code: "BAYVIEWFAM", short_code: "BAYVIEW", name: "Bay View Family YMCA", association_id: "as1" },
            { id: "br-2", code: "PHLMAIN", short_code: "PHL", name: "Philadelphia YMCA", association_id: "as2" },
          ],
        })
      }
      // recipients default
      if (url.includes("/api/maintenance/recipients?branch_id=br-1")) return mockJson(true, [])
      if (url.includes("/api/maintenance/recipients?branch_id=br-2")) return mockJson(true, [])
      return mockJson(false, { error: "not found" }, 404)
    })

    vi.stubGlobal("fetch", fetchMock as any)

    render(<RecipientsTab />)

    await screen.findByRole("button", { name: /ny - alliance of new york state ymcas/i })

    // Open Alliance dropdown and select PA
    fireEvent.click(screen.getByRole("button", { name: /ny - alliance of new york state ymcas/i }))
    fireEvent.click(await screen.findByText(/pa - alliance of pennsylvania ymcas/i))

    // Wait for trigger to reflect new selection
    await screen.findByRole("button", { name: /pa - alliance of pennsylvania ymcas/i })

    // Association dropdown should no longer include GROC
    fireEvent.click(screen.getByText("Select Association..."))
    expect(screen.queryByText(/groc - ymca of greater rochester/i)).toBeNull()
    expect(screen.getByText(/phl - ymca of greater philadelphia/i)).toBeInTheDocument()
  })

  it("creates a Branch recipient (POST) when form is valid", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes("/api/maintenance/organization")) {
        return mockJson(true, {
          alliances: [{ id: "a1", code: "NY", name: "Alliance of New York State YMCAs" }],
          associations: [{ id: "as1", code: "GROC", name: "YMCA of Greater Rochester", alliance_id: "a1" }],
          branches: [{ id: "br-1", code: "BAYVIEWFAM", short_code: "BAYVIEW", name: "Bay View Family YMCA", association_id: "as1" }],
        })
      }
      if (url.includes("/api/maintenance/recipients?branch_id=br-1")) return mockJson(true, [])
      if (url.endsWith("/api/maintenance/recipients") && init?.method === "POST") {
        const body = JSON.parse(String(init.body))
        expect(body.branch_id).toBe("br-1")
        expect(body.email).toBe("newmanager@ymca.org")
        expect(body.create_auth_user).toBe(true)
        expect(body.temp_password).toBeUndefined()
        return mockJson(true, { id: "r-new", welcome_email_sent: true }, 201)
      }
      return mockJson(false, { error: "not found" }, 404)
    })

    vi.stubGlobal("fetch", fetchMock as any)

    render(<RecipientsTab />)
    await screen.findByRole("heading", { name: /recipients/i })

    fireEvent.click(screen.getByRole("button", { name: /add member/i }))

    fireEvent.change(screen.getByPlaceholderText("recipient@example.com"), {
      target: { value: "newmanager@ymca.org" },
    })

    fireEvent.click(screen.getByRole("button", { name: /create & email welcome/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
  })
})

