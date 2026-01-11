import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"

import Home from "@/app/page"

const mockDevSignIn = vi.fn()
const mockSetRecipientContext = vi.fn()
const mockSetBranch = vi.fn()

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    devSignIn: mockDevSignIn,
    isDevMode: false,
    setRecipientContext: mockSetRecipientContext,
    signOut: vi.fn(),
    recipientContext: { recipient_type: null, branch_id: null, association_id: null, alliance_id: null },
  }),
}))

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    setBranch: mockSetBranch,
  }),
}))

const mockSignInWithPassword = vi.fn()
const mockUpdateUserPassword = vi.fn()

vi.mock("@/lib/supabaseClient", () => ({
  signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
  signUpWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  updateUserPassword: (...args: any[]) => mockUpdateUserPassword(...args),
}))

function mockJson(ok: boolean, data: any, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
  }
}

describe("Phase 5 - First-time login password setup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows "Forgot Password?" link below password field', async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockJson(true, {})) as any)
    mockSignInWithPassword.mockResolvedValue({ error: null })

    render(<Home />)
    expect(screen.getByText("Forgot Password?")).toBeInTheDocument()
  })

  it("forces Create Password modal when needs_password_setup=true", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/api/auth/login-context")) {
        return mockJson(true, {
          recipient: {
            email: "manager@ymca.org",
            recipient_type: "Branch",
            branch_id: "br-1",
            needs_password_setup: true,
          },
          branch: { id: "br-1", name: "Bay View Family YMCA" },
        })
      }
      if (url.endsWith("/api/auth/complete-password-setup")) {
        return mockJson(true, { success: true })
      }
      return mockJson(true, {})
    })
    vi.stubGlobal("fetch", fetchMock as any)

    mockSignInWithPassword.mockResolvedValue({ error: null })
    mockUpdateUserPassword.mockResolvedValue({ error: null })

    render(<Home />)

    fireEvent.change(screen.getByPlaceholderText("your.email@ymca.org"), {
      target: { value: "manager@ymca.org" },
    })
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "TempPass1" },
    })

    fireEvent.click(screen.getByRole("button", { name: /submit sign in/i }))

    expect(await screen.findByText(/welcome! please create your password/i)).toBeInTheDocument()
    // Modal cannot be dismissed (no X close button)
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull()

    // Set new password
    fireEvent.change(screen.getByPlaceholderText(/minimum 8 chars/i), {
      target: { value: "NewPass123" },
    })
    fireEvent.change(screen.getByPlaceholderText("Re-enter password"), {
      target: { value: "NewPass123" },
    })

    fireEvent.click(screen.getByRole("button", { name: /set password & continue/i }))

    await waitFor(() => {
      expect(mockUpdateUserPassword).toHaveBeenCalledWith("NewPass123")
    })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/complete-password-setup",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  it('shows "Account deactivated" error if inactive', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/api/auth/login-context")) {
        return mockJson(false, { error: "Account deactivated" }, 403)
      }
      return mockJson(true, {})
    })
    vi.stubGlobal("fetch", fetchMock as any)

    mockSignInWithPassword.mockResolvedValue({ error: null })

    render(<Home />)

    fireEvent.change(screen.getByPlaceholderText("your.email@ymca.org"), {
      target: { value: "inactive@ymca.org" },
    })
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "Whatever123" },
    })

    fireEvent.click(screen.getByRole("button", { name: /submit sign in/i }))

    expect(await screen.findByText(/account deactivated/i)).toBeInTheDocument()
  })
})

