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

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/lib/error-logger", () => ({
  logError: vi.fn(async () => "E_TEST"),
}));

describe("SchedulingPage holiday loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Load holidays next to Publish when selected schedule year is missing, and hides it when present", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [{ id: "sch-1", name: "January 2026", month_start: "2026-01-01", status: "draft" }],
        });
      }
      if (url.endsWith("/api/branches/br-1")) return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });

      // SessionsTab child requests (minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });

      // Holiday year status check (first call: missing)
      if (url.includes("/api/maintenance/holidays/import-us?") && url.includes("year=2026")) {
        return mockJson(true, { requestedYear: 2026, requestedYearMissing: true });
      }

      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    // Publish button appears after schedules load.
    const publish = await screen.findByRole("button", { name: "Publish" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Load holidays/i })).toBeInTheDocument();
    });

    // Basic adjacency check: Load holidays should appear after Publish in DOM order.
    const loadBtn = screen.getByRole("button", { name: /Load holidays/i });
    expect(publish.compareDocumentPosition(loadBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("imports holidays via modal and hides the button after success", async () => {
    let statusMissing = true;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [{ id: "sch-1", name: "January 2026", month_start: "2026-01-01", status: "draft" }],
        });
      }
      if (url.endsWith("/api/branches/br-1")) return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });

      // SessionsTab child requests (minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });

      if (url.includes("/api/maintenance/holidays/import-us?") && url.includes("year=2026")) {
        return mockJson(true, { requestedYear: 2026, requestedYearMissing: statusMissing });
      }

      if (url.includes("/api/maintenance/holidays/import-us") && init?.method === "POST") {
        statusMissing = false;
        return mockJson(true, { insertedCount: 3, updatedCount: 0, requestedYear: 2026, requestedYearMissing: false });
      }

      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    const loadBtn = await screen.findByRole("button", { name: /Load holidays/i });
    fireEvent.click(loadBtn);

    // Confirm modal
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText(/Holidays loaded successfully/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Load holidays/i })).not.toBeInTheDocument();
    });
  });

  it("shows an error on failure and keeps Load holidays available to retry", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [{ id: "sch-1", name: "January 2026", month_start: "2026-01-01", status: "draft" }],
        });
      }
      if (url.endsWith("/api/branches/br-1")) return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });

      // SessionsTab child requests (minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });

      if (url.includes("/api/maintenance/holidays/import-us?") && url.includes("year=2026")) {
        return mockJson(true, { requestedYear: 2026, requestedYearMissing: true });
      }

      if (url.includes("/api/maintenance/holidays/import-us") && init?.method === "POST") {
        return mockJson(false, { error: "Boom" }, 500);
      }

      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    const loadBtn = await screen.findByRole("button", { name: /Load holidays/i });
    fireEvent.click(loadBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load" }));

    await waitFor(() => {
      expect(screen.getByText(/Boom/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Load holidays/i })).toBeInTheDocument();
    });
  });
});

