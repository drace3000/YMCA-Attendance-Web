import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

import MaintenancePage from "@/app/maintenance/page"

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({
    isAdmin: true,
    isBranch: false,
    allianceId: null,
    associationId: null,
    branchId: null,
    canAccessAlliance: () => true,
    canAccessAssociation: () => true,
    canAccessBranch: () => true,
  }),
}))

const setBranchMock = vi.fn()
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    branch: { id: "br-1", name: "Bay View Family YMCA" },
    setBranch: (...args: any[]) => setBranchMock(...args),
  }),
}))

type FetchResponse = {
  ok: boolean
  status?: number
  json: () => Promise<any>
}

function mockJson(ok: boolean, data: any, status = 200): FetchResponse {
  return { ok, status, json: async () => data }
}

describe("Maintenance admin hierarchy selector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Provide a predictable localStorage implementation for this test file.
    const store = new Map<string, string>()
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    })
    try {
      window.localStorage.removeItem("ymca-admin-last-branch-id")
    } catch {
      // ignore
    }
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("renders Admin Branch Context bar for admins and loads hierarchy", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/maintenance/organization")) {
        return mockJson(true, {
          alliances: [{ id: "a1", code: "NY", name: "Alliance of NY" }],
          associations: [{ id: "as1", code: "GROC", name: "Greater Rochester", alliance_id: "a1" }],
          branches: [
            { id: "br-1", code: "bay_view_family_ymca", short_code: "BV", name: "Bay View Family YMCA", association_id: "as1" },
          ],
        })
      }
      if (url.includes("/api/maintenance/instructors")) {
        return mockJson(true, [])
      }
      return mockJson(true, {})
    })
    vi.stubGlobal("fetch", fetchMock as any)

    render(<MaintenancePage />)

    expect(await screen.findByText(/admin branch context/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/maintenance/organization")
    })
  })

  it("applies last admin-selected branch from localStorage", async () => {
    localStorage.setItem("ymca-admin-last-branch-id", "br-2")

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/api/maintenance/organization")) {
        return mockJson(true, {
          alliances: [{ id: "a1", code: "NY", name: "Alliance of NY" }],
          associations: [{ id: "as1", code: "GROC", name: "Greater Rochester", alliance_id: "a1" }],
          branches: [
            { id: "br-1", code: "bay_view_family_ymca", short_code: "BV", name: "Bay View Family YMCA", association_id: "as1" },
            { id: "br-2", code: "eastside_family_ymca", short_code: "ES", name: "Eastside Family YMCA", association_id: "as1" },
          ],
        })
      }
      if (url.includes("/api/maintenance/instructors")) {
        return mockJson(true, [])
      }
      return mockJson(true, {})
    })
    vi.stubGlobal("fetch", fetchMock as any)

    render(<MaintenancePage />)

    await screen.findByText(/admin branch context/i)

    await waitFor(() => {
      expect(setBranchMock).toHaveBeenCalled()
    })

    const call = setBranchMock.mock.calls[0]?.[0]
    expect(call).toEqual({ id: "br-2", name: "Eastside Family YMCA" })
  })
})

