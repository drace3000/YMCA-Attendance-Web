import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

import { SessionsTab } from "@/app/scheduling/sessions-tab"

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

describe("SessionsTab reference data", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("fetches locations + instructors scoped to branch_id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, [])
      if (url.includes("/api/maintenance/locations")) return mockJson(true, [])
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, [])
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] })
      return mockJson(true, {})
    })

    vi.stubGlobal("fetch", fetchMock as any)

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
      />
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const locationsCall = fetchMock.mock.calls.find(([arg]) =>
      String(arg).includes("/api/maintenance/locations")
    )
    expect(locationsCall).toBeTruthy()
    expect(String(locationsCall?.[0])).toContain("include_inactive=true")
    expect(String(locationsCall?.[0])).toContain("branch_id=br-1")

    const instructorsCall = fetchMock.mock.calls.find(([arg]) =>
      String(arg).includes("/api/maintenance/instructors")
    )
    expect(instructorsCall).toBeTruthy()
    expect(String(instructorsCall?.[0])).toContain("include_inactive=true")
    expect(String(instructorsCall?.[0])).toContain("branch_id=br-1")
  })
})

