import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

vi.mock("next/image", () => ({
  default: (props: any) => {
    // Minimal Next/Image stand-in for tests
    // eslint-disable-next-line jsx-a11y/alt-text
    const { priority: _priority, fill: _fill, ...rest } = props
    return <img {...rest} />
  },
}))

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("email=user%40ymca.org&mode=otp"),
}))

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    devSignIn: vi.fn(),
    isDevMode: false,
    setRecipientContext: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    setBranch: vi.fn(),
  }),
}))

vi.mock("@/lib/supabaseClient", () => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  updateUserPassword: vi.fn(),
  verifyOtp: vi.fn(),
}))

describe("Home (Welcome page) - OTP deep link", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("prefills email and opens OTP sign-in mode when mode=otp", async () => {
    const { default: Home } = await import("@/app/page")
    render(<Home />)

    expect(screen.getByPlaceholderText(/your\.email@ymca\.org/i)).toHaveValue("user@ymca.org")
    expect(screen.getByRole("button", { name: /send code/i })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/enter your password/i)).toBeNull()
  })
})

