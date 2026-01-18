import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { GET, POST } from "@/app/api/maintenance/locations/route"

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

const mockRequireRecipientAccess = vi.fn()
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}))

describe("API - /api/maintenance/locations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("GET: admin falls back to access.branch_id when branch_id is missing", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: "br-admin" },
    })

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        locations: async (state) => {
          const branchFilter = state.filters.find((f) => f.op === "eq" && f.column === "branch_id")
          expect(branchFilter?.value).toBe("br-admin")
          return { data: [], error: null }
        },
      })
    )

    const req = new NextRequest("http://localhost:3000/api/maintenance/locations")
    const res = await GET(req)

    expect(res.status).toBe(200)
  })

  it("GET: returns 400 when branch_id is missing and no fallback branch exists", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Administrator", branch_id: null },
    })

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        locations: async () => ({ data: [], error: null }),
      })
    )

    const req = new NextRequest("http://localhost:3000/api/maintenance/locations")
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json).toEqual({ error: "branch_id is required" })
  })

  it("GET: branch user is forced to their branch_id (even if query requests another)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    })

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        locations: async (state) => {
          const branchFilter = state.filters.find((f) => f.op === "eq" && f.column === "branch_id")
          expect(branchFilter?.value).toBe("br-1")
          return { data: [], error: null }
        },
      })
    )

    const req = new NextRequest(
      "http://localhost:3000/api/maintenance/locations?branch_id=br-other"
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it("POST: branch user creates location for their branch (branch_id forced)", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    })

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        locations: async (state) => {
          if (state.action === "select") return { data: [], error: null } // uniqueness checks
          if (state.action === "insert") {
            const payload = state.payload as any
            // insert receives an array or object depending on supabase; our route sends object
            expect(payload.branch_id).toBe("br-1")
            expect(payload.code).toBe("L1")
            expect(payload.name).toBe("Pool")
            return { data: { id: "loc-1", ...payload }, error: null }
          }
          return { data: null, error: null }
        },
      })
    )

    const req = new NextRequest("http://localhost:3000/api/maintenance/locations", {
      method: "POST",
      body: JSON.stringify({ code: "L1", name: "Pool", branch_id: "br-other" }),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.branch_id).toBe("br-1")
  })
})


