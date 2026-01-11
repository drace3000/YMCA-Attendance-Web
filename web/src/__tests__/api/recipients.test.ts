import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

import { POST, DELETE } from "@/app/api/maintenance/recipients/route"

type MockQueryState = {
  table: string
  action: "select" | "insert" | "update" | "delete"
  payload?: unknown
  filters: Array<{ op: "eq" | "ilike" | "neq"; column: string; value: unknown }>
  wantSingle: boolean
}

type MockHandlerResult = { data: any; error: any }
type MockTableHandler = (state: MockQueryState) => Promise<MockHandlerResult> | MockHandlerResult

function createMockSupabaseClient(handlers: Record<string, MockTableHandler>) {
  function makeBuilder(table: string) {
    const state: MockQueryState = {
      table,
      action: "select",
      filters: [],
      wantSingle: false,
    }

    const builder: any = {
      select: () => builder,
      insert: (payload: unknown) => {
        state.action = "insert"
        state.payload = payload
        return builder
      },
      update: (payload: unknown) => {
        state.action = "update"
        state.payload = payload
        return builder
      },
      delete: () => {
        state.action = "delete"
        return builder
      },
      eq: (column: string, value: unknown) => {
        state.filters.push({ op: "eq", column, value })
        return builder
      },
      ilike: (column: string, value: unknown) => {
        state.filters.push({ op: "ilike", column, value })
        return builder
      },
      neq: (column: string, value: unknown) => {
        state.filters.push({ op: "neq", column, value })
        return builder
      },
      order: () => builder,
      single: () => {
        state.wantSingle = true
        return builder
      },
      maybeSingle: () => {
        state.wantSingle = true
        return builder
      },
      then: (resolve: any, reject: any) => {
        const handler = handlers[table]
        const result = handler ? handler(state) : { data: null, error: null }
        return Promise.resolve(result).then(resolve, reject)
      },
    }

    return builder
  }

  return {
    from: (table: string) => makeBuilder(table),
  }
}

const mockCreateSupabaseServerClient = vi.fn()
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}))

const mockCreateUser = vi.fn()
const mockUpdateUserById = vi.fn()
const mockDeleteUser = vi.fn()
const mockListUsers = vi.fn()
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: (...args: any[]) => mockCreateUser(...args),
        updateUserById: (...args: any[]) => mockUpdateUserById(...args),
        deleteUser: (...args: any[]) => mockDeleteUser(...args),
        listUsers: (...args: any[]) => mockListUsers(...args),
      },
    },
  },
}))

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

const mockRequireRecipientAccess = vi.fn()
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}))

describe("Phase 3 - POST /api/maintenance/recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = "test_key"
    process.env.RESEND_FROM_EMAIL = "test@resend.dev"
    mockRequireRecipientAccess.mockResolvedValue({
      ok: true,
      access: {
        email: "admin@example.com",
        recipient_type: "Administrator",
        is_active: true,
        needs_password_setup: false,
        last_login_at: null,
        branch_id: "11111111-1111-1111-1111-111111111111",
        branch: { id: "11111111-1111-1111-1111-111111111111", name: "Assigned Branch" },
        association_id: null,
        alliance_id: null,
      },
    })
  })

  it("returns 409 when email already exists (global)", async () => {
    const supabase = createMockSupabaseClient({
      branch_schedule_recipients: (state) => {
        if (state.action === "select") return { data: [{ id: "r1" }], error: null }
        return { data: null, error: null }
      },
    })
    mockCreateSupabaseServerClient.mockReturnValue(supabase)

    const req = new NextRequest("http://localhost:3000/api/maintenance/recipients", {
      method: "POST",
      body: JSON.stringify({ branch_id: "11111111-1111-1111-1111-111111111111", email: "Test@Example.com" }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toMatch(/already added/i)
  })

  it("creates auth user + recipient when create_auth_user=true and triggers welcome email", async () => {
    const inserted: any[] = []

    const supabase = createMockSupabaseClient({
      branch_schedule_recipients: (state) => {
        if (state.action === "select") return { data: [], error: null }
        if (state.action === "insert") {
          inserted.push(state.payload)
          return {
            data: { id: "new-id", email: (state.payload as any).email, branch_id: (state.payload as any).branch_id },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      ymca_branches: (state) => {
        if (state.action === "select") {
          return {
            data: {
              id: "b1",
              name: "Bay View Family YMCA",
              association: { id: "a1", name: "YMCA of Greater Rochester", alliance: { id: "al1", name: "Alliance of New York State YMCAs" } },
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })
    mockCreateSupabaseServerClient.mockReturnValue(supabase)

    mockCreateUser.mockResolvedValue({ data: { user: { id: "auth-123" } }, error: null })
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: null })
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg-1" })

    const req = new NextRequest("http://localhost:3000/api/maintenance/recipients", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "11111111-1111-1111-1111-111111111111",
        email: "Manager@Example.com",
        first_name: "Test",
        recipient_type: "Branch",
        create_auth_user: true,
      }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(mockCreateUser).toHaveBeenCalledOnce()
    expect(mockCreateUser.mock.calls[0]?.[0]).toMatchObject({
      email: "manager@example.com",
      email_confirm: true,
    })
    expect(typeof mockCreateUser.mock.calls[0]?.[0]?.password).toBe("string")
    expect(inserted.length).toBe(1)
    expect(inserted[0]).toMatchObject({
      email: "manager@example.com",
      auth_user_id: "auth-123",
      needs_password_setup: true,
      is_active: true,
    })
    expect(mockSendEmail).toHaveBeenCalledOnce()
    expect(json.welcome_email_sent).toBe(true)
    expect(json.temp_password).toBeUndefined()
  })

  it("re-links existing auth user when auth says already registered", async () => {
    const inserted: any[] = []

    const supabase = createMockSupabaseClient({
      branch_schedule_recipients: (state) => {
        if (state.action === "select") return { data: [], error: null }
        if (state.action === "insert") {
          inserted.push(state.payload)
          return {
            data: { id: "new-id", email: (state.payload as any).email, branch_id: (state.payload as any).branch_id },
            error: null,
          }
        }
        return { data: null, error: null }
      },
      ymca_branches: (state) => {
        if (state.action === "select") {
          return {
            data: {
              id: "b1",
              name: "Bay View Family YMCA",
              association: { id: "a1", name: "YMCA of Greater Rochester", alliance: { id: "al1", name: "Alliance of New York State YMCAs" } },
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })
    mockCreateSupabaseServerClient.mockReturnValue(supabase)

    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    })
    mockListUsers.mockResolvedValue({ data: { users: [{ id: "auth-existing", email: "manager@example.com" }] }, error: null })
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg-2" })

    const req = new NextRequest("http://localhost:3000/api/maintenance/recipients", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "11111111-1111-1111-1111-111111111111",
        email: "Manager@Example.com",
        first_name: "Test",
        recipient_type: "Branch",
        create_auth_user: true,
      }),
      headers: { "Content-Type": "application/json" },
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(inserted[0]).toMatchObject({ auth_user_id: "auth-existing" })
  })
})

describe("Phase 4 - DELETE /api/maintenance/recipients", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = "test_key"
    process.env.RESEND_FROM_EMAIL = "test@resend.dev"
    mockRequireRecipientAccess.mockResolvedValue({
      ok: true,
      access: {
        email: "admin@example.com",
        recipient_type: "Administrator",
        is_active: true,
        needs_password_setup: false,
        last_login_at: null,
        branch_id: "11111111-1111-1111-1111-111111111111",
        branch: { id: "11111111-1111-1111-1111-111111111111", name: "Assigned Branch" },
        association_id: null,
        alliance_id: null,
      },
    })
  })

  it("deletes linked auth user when deleting recipient", async () => {
    const supabase = createMockSupabaseClient({
      branch_schedule_recipients: (state) => {
        // First: load recipient
        if (state.action === "select" && state.wantSingle) {
          // distinguish the "load recipient" call vs "check other references" by filters
          const hasIdEq = state.filters.some((f) => f.op === "eq" && f.column === "id" && f.value === "r1")
          const hasAuthEq = state.filters.some((f) => f.op === "eq" && f.column === "auth_user_id" && f.value === "auth-1")
          if (hasIdEq) return { data: { id: "r1", email: "x@example.com", auth_user_id: "auth-1" }, error: null }
          if (hasAuthEq) return { data: [], error: null }
          return { data: [], error: null }
        }
        if (state.action === "delete") return { data: null, error: null }
        return { data: null, error: null }
      },
    })
    mockCreateSupabaseServerClient.mockReturnValue(supabase)

    mockDeleteUser.mockResolvedValue({ data: {}, error: null })

    const req = new NextRequest("http://localhost:3000/api/maintenance/recipients?id=r1", { method: "DELETE" })
    const res = await DELETE(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.auth_user_deleted).toBe(true)
    expect(mockDeleteUser).toHaveBeenCalledWith("auth-1")
  })
})

