import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react"

import Home from "@/app/page"

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    devSignIn: vi.fn(),
    isDevMode: false,
    setRecipientContext: vi.fn(),
    recipientContext: { recipient_type: null, branch_id: null, association_id: null, alliance_id: null },
  }),
}))

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    setBranch: vi.fn(),
  }),
}))

const mockSendCode = vi.fn()
const mockVerifyCode = vi.fn()
vi.mock("@/lib/password-reset-otp", () => ({
  sendPasswordResetCode: (...args: any[]) => mockSendCode(...args),
  verifyPasswordResetCode: (...args: any[]) => mockVerifyCode(...args),
}))

const mockUpdateUserPassword = vi.fn()
vi.mock("@/lib/supabaseClient", () => ({
  signInWithPassword: vi.fn(),
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

describe("Phase 6 - Forgot Password modal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('opens modal from "Forgot Password?" and disables Send button until valid email', async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockJson(true, {})) as any)

    render(<Home />)

    fireEvent.click(screen.getByText("Forgot Password?"))
    expect(await screen.findByText("Reset Password")).toBeInTheDocument()

    const sendBtn = screen.getByRole("button", { name: /send reset code/i })
    expect(sendBtn).toBeDisabled()

    fireEvent.change(screen.getByLabelText("Forgot password email"), {
      target: { value: "manager@ymca.org" },
    })
    expect(sendBtn).not.toBeDisabled()
  })

  it("sends code, allows OTP + password reset, and shows success", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/api/auth/complete-password-setup")) return mockJson(true, { success: true })
      return mockJson(true, {})
    })
    vi.stubGlobal("fetch", fetchMock as any)

    mockSendCode.mockResolvedValue({ error: null })
    mockVerifyCode.mockResolvedValue({ error: null })
    mockUpdateUserPassword.mockResolvedValue({ error: null })

    render(<Home />)

    fireEvent.click(screen.getByText("Forgot Password?"))
    fireEvent.change(screen.getByLabelText("Forgot password email"), {
      target: { value: "manager@ymca.org" },
    })
    fireEvent.click(screen.getByRole("button", { name: /send reset code/i }))

    expect(await screen.findByText(/reset code sent/i)).toBeInTheDocument()

    // Fill OTP digits
    const otpInputs = screen.getAllByRole("textbox").filter((el) => (el as HTMLInputElement).maxLength === 1)
    expect(otpInputs.length).toBeGreaterThanOrEqual(6)
    for (let i = 0; i < 6; i++) {
      fireEvent.change(otpInputs[i]!, { target: { value: String(i + 1) } })
    }

    fireEvent.change(screen.getByPlaceholderText(/minimum 8 chars/i), {
      target: { value: "NewPass123" },
    })
    fireEvent.change(screen.getByPlaceholderText("Re-enter password"), {
      target: { value: "NewPass123" },
    })

    fireEvent.click(screen.getByRole("button", { name: /^reset password$/i }))

    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith("manager@ymca.org", "123456")
    })
    await waitFor(() => {
      expect(mockUpdateUserPassword).toHaveBeenCalledWith("NewPass123")
    })

    expect(await screen.findByText(/password reset successfully/i)).toBeInTheDocument()
  })

  it("shows Resend Code after 60 seconds", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("fetch", vi.fn(async () => mockJson(true, {})) as any)
    mockSendCode.mockResolvedValue({ error: null })

    render(<Home />)

    fireEvent.click(screen.getByText("Forgot Password?"))
    fireEvent.change(screen.getByLabelText("Forgot password email"), {
      target: { value: "manager@ymca.org" },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send reset code/i }))
      await Promise.resolve()
    })

    expect(screen.getByText(/resend available in/i)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByRole("button", { name: /resend code/i })).toBeInTheDocument()
  })
})

