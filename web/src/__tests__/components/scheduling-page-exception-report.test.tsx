import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import SchedulingPage from "@/app/scheduling/page";

type FetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<any>;
};

function mockJson(ok: boolean, data: any, status = 200): FetchResponse {
  return {
    ok,
    status,
    json: async () => data,
  };
}

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    branch: { id: "br-1", name: "Branch 1" },
  }),
}));

vi.mock("@/lib/error-logger", () => ({
  logError: vi.fn(async () => "E_TEST"),
}));

describe("SchedulingPage exception report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Exception Report button for pending-approval schedule and loads the report", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      // Initial page loads
      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [{ id: "sch-1", name: "January 2026", month_start: "2026-01-01", status: "draft", is_approved: false }],
        });
      }
      if (url.endsWith("/api/branches/br-1")) {
        return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });
      }

      // SessionsTab child requests (keep minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      // Exception report API
      if (url.includes("/api/scheduling/clone/constraints-report")) {
        return mockJson(true, {
          ok: true,
          title: "Cloning January 2026 Schedule Exception Report",
          org_line: "Association - Branch 1",
          stats: { created_sessions: 10, skipped_sessions: 2, modified_sessions: 0 },
          groups: [],
        });
      }

      // default
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    // Pending approval badge should appear and the Exception Report button should be visible.
    await waitFor(() => {
      expect(screen.getByText("Pending approval")).toBeInTheDocument();
    });

    const btn = await screen.findByRole("button", { name: "Exception Report" });
    fireEvent.click(btn);

    // Modal should show the report title (as subheader line).
    await waitFor(() => {
      expect(screen.getByText("Cloning January 2026 Schedule Exception Report")).toBeInTheDocument();
    });

    // Ensure we called the report endpoint.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/scheduling/clone/constraints-report"));
  }, 20000);
});

