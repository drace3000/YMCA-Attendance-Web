import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import SettingsPage from "@/app/settings/page";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isBranch: false }),
}));

describe("Settings - Availability time range", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseThemeSettings.mockReturnValue({
      branch: { id: "br-1", name: "Branch One" },
      setBranch: vi.fn(),
      brandColor: "#01A490",
      setBrandColor: vi.fn(),
      sidebarPosition: "left",
      setSidebarPosition: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("saves the per-branch availability time range via PATCH /api/branches/:id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      // Initial branches list
      if (url.endsWith("/api/branches") && (!init || !init.method || init.method === "GET")) {
        return new Response(
          JSON.stringify([
            { id: "br-1", name: "Branch One", association: { id: "a1", code: "GROC" } },
          ]),
          { status: 200 },
        );
      }

      // Org names + time range load
      if (url.endsWith("/api/branches/br-1") && (!init || !init.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            id: "br-1",
            name: "Branch One",
            association_name: "Association",
            association_code: "GROC",
            alliance_name: "Alliance",
            availability_time_start: "06:00",
            availability_time_end: "23:00",
          }),
          { status: 200 },
        );
      }

      // Program groups load
      if (url.endsWith("/api/branches/br-1/program-groups") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify({ groups: [] }), { status: 200 });
      }

      // Save availability range
      if (url.endsWith("/api/branches/br-1") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SettingsPage />);

    // Wait for section to appear (data loads async)
    await screen.findByText(/Availability time range/i);

    // Card is collapsible + default closed; open it before interacting with TimePickers
    fireEvent.click(screen.getByRole("button", { name: /Expand Availability time range/i }));

    fireEvent.click(screen.getByRole("button", { name: /Availability time start/i }));
    fireEvent.click(await screen.findByText("07:00 AM"));

    fireEvent.click(screen.getByRole("button", { name: /Availability time end/i }));
    fireEvent.click(await screen.findByText("10:00 PM"));

    fireEvent.click(screen.getByRole("button", { name: /Save Availability Range/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => {
        const url = String(c[0]);
        const init = c[1] as RequestInit | undefined;
        return url.endsWith("/api/branches/br-1") && init?.method === "PATCH";
      });
      expect(calls.length).toBe(1);
      const body = JSON.parse(String((calls[0][1] as RequestInit).body));
      expect(body).toEqual({
        availability_time_start: "07:00",
        availability_time_end: "22:00",
      });
    });
  });
});


