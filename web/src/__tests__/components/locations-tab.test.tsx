import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

import { LocationsTab } from "@/app/maintenance/locations-tab"

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    branch: { id: "br-1", name: "Eastside Family YMCA" },
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

describe("LocationsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("loads locations scoped to the selected branch (passes branch_id)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/maintenance/locations")) {
        return mockJson(true, [])
      }
      return mockJson(false, { error: "not found" }, 404)
    })

    vi.stubGlobal("fetch", fetchMock as any)

    render(<LocationsTab />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const locationsCall = fetchMock.mock.calls.find(([arg]) =>
      String(arg).includes("/api/maintenance/locations")
    )
    expect(locationsCall).toBeTruthy()
    expect(String(locationsCall?.[0])).toContain("branch_id=br-1")
  })
})

