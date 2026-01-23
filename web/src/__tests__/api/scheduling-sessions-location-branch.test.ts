import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

import { POST, PUT } from "@/app/api/scheduling/sessions/route"

type MockQueryState = {
  table: string
  action: "select" | "insert" | "update" | "delete"
  payload?: unknown
  filters: Array<{ op: "eq" | "ilike" | "neq" | "in" | "is" | "gt"; column: string; value: unknown }>
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
      in: (column: string, value: unknown) => {
        state.filters.push({ op: "in", column, value })
        return builder
      },
      is: (column: string, value: unknown) => {
        state.filters.push({ op: "is", column, value })
        return builder
      },
      gt: (column: string, value: unknown) => {
        state.filters.push({ op: "gt", column, value })
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

const mockRequireRecipientAccess = vi.fn()
vi.mock("@/lib/requireRecipientAccess", () => ({
  requireRecipientAccess: (...args: any[]) => mockRequireRecipientAccess(...args),
}))

describe("API - /api/scheduling/sessions location branch validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("POST: rejects when location_id is not available for the branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    })

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1" }, error: null }),
        classes: async () => ({ data: { id: "c-1" }, error: null }),
        locations: async (state) => {
          // location validation query
          expect(state.action).toBe("select")
          const branchFilter = state.filters.find((f) => f.op === "eq" && f.column === "branch_id")
          expect(branchFilter?.value).toBe("br-1")
          return { data: null, error: null }
        },
        class_sessions: async () => {
          throw new Error("should not insert session when location validation fails")
        },
      })
    )

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "POST",
      body: JSON.stringify({
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "c-1",
        location_id: "loc-999",
        day_of_week: "monday",
        start_time: "08:00",
        end_time: "09:00",
        session_date: "2026-01-01",
        instructor_ids: [],
      }),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json).toEqual({ error: "Selected location is not available for this branch" })
  })

  it("PUT: rejects when updating class_id to one not available for the branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    })

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        schedules: async () => ({ data: { id: "sch-1", is_approved: true }, error: null }),
        classes: async (state) => {
          // class validation query
          expect(state.action).toBe("select")
          const branchFilter = state.filters.find((f) => f.op === "eq" && f.column === "branch_id")
          expect(branchFilter?.value).toBe("br-1")
          return { data: null, error: null }
        },
        class_sessions: async (state) => {
          if (state.action === "select" && state.wantSingle) {
            // Current session prefetch
            return {
              data: {
                id: "sess-1",
                branch_id: "br-1",
                schedule_id: "sch-1",
                day_of_week: "THURSDAY",
                start_time: "08:00",
                end_time: "09:00",
                session_date: "2026-01-01",
                location_id: "loc-1",
              },
              error: null,
            }
          }
          if (state.action === "update") {
            throw new Error("should not update session when class validation fails")
          }
          return { data: null, error: null }
        },
      })
    )

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "PUT",
      body: JSON.stringify({
        id: "sess-1",
        class_id: "cls-999",
      }),
    })

    const res = await PUT(req)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json).toEqual({ error: "Selected class is not available for this branch" })
  })

  it("PUT: rejects when updating location_id to one not available for the branch", async () => {
    mockRequireRecipientAccess.mockResolvedValueOnce({
      ok: true,
      access: { recipient_type: "Branch", branch_id: "br-1" },
    })

    mockCreateSupabaseServerClient.mockReturnValue(
      createMockSupabaseClient({
        locations: async () => ({ data: null, error: null }),
        schedules: async () => ({ data: { id: "sch-1", month_start: "2026-01-01" }, error: null }),
        session_instructors: async () => ({ data: [], error: null }),
        class_sessions: async (state) => {
          if (state.action === "select" && state.wantSingle) {
            // Current session prefetch
            return {
              data: {
                id: "sess-1",
                branch_id: "br-1",
                schedule_id: "sch-1",
                day_of_week: "THURSDAY",
                start_time: "08:00",
                end_time: "09:00",
                session_date: "2026-01-01",
                location_id: "loc-1",
              },
              error: null,
            }
          }
          if (state.action === "select" && !state.wantSingle) {
            // Conflict preflight: other sessions on the date
            return { data: [], error: null }
          }
          if (state.action === "update") {
            throw new Error("should not update session when location validation fails")
          }
          return { data: null, error: null }
        },
      })
    )

    const req = new NextRequest("http://localhost:3000/api/scheduling/sessions", {
      method: "PUT",
      body: JSON.stringify({
        id: "sess-1",
        location_id: "loc-999",
      }),
    })

    const res = await PUT(req)
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json).toEqual({ error: "Selected location is not available for this branch" })
  })
})

