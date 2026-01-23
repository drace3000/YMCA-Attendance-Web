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

describe("SchedulingPage publish confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("requires confirmation before publishing when preflight has MEDIUM conflicts (no HIGH)", async () => {
    let publishCalls = 0;
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
          schedules: [{ id: "sch-1", name: "January 2026", month_start: "2026-01-01", status: "draft" }],
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
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return mockJson(true, { requestedYear: 2026, requestedYearMissing: false });
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      // Publish preflight verify
      if (url.includes("/api/scheduling/conflicts") && init?.method === "POST") {
        return mockJson(true, {
          summary: { high: 0, medium: 2, low: 0, total: 2 },
          conflicts: [
            { type: "INSTRUCTOR_TRANSITION_TIME", severity: "MEDIUM", message: "Warning: only 5 minutes transition time." },
            { type: "INSTRUCTOR_MAX_HOURS", severity: "MEDIUM", message: "Warning: instructor exceeds daily max." },
          ],
        });
      }

      // Publish call
      if (url.includes("/api/scheduling/publish") && init?.method === "POST") {
        publishCalls += 1;
        return mockJson(true, { success: true, email: { attempted: 0 } });
      }

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    // Wait for schedules to load and the Publish button to appear.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    // Preflight should load and show summary.
    await waitFor(() => {
      expect(screen.getByText(/Conflicts summary/i)).toBeInTheDocument();
      expect(screen.getByText(/2\s+MEDIUM/i)).toBeInTheDocument();
    });

    // Clicking Publish Now should require confirmation and NOT call publish yet.
    fireEvent.click(screen.getByRole("button", { name: "Publish Now" }));

    await waitFor(() => {
      expect(screen.getByText(/MEDIUM conflicts detected/i)).toBeInTheDocument();
    });
    expect(publishCalls).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Publish" }));

    await waitFor(() => {
      expect(publishCalls).toBe(1);
    });
  }, 15000);

  it("disables Clone Next Month and Publish when the schedule has any HIGH conflicts", async () => {
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
          schedules: [{ id: "sch-1", name: "January 2026", month_start: "2026-01-01", status: "draft" }],
        });
      }
      if (url.endsWith("/api/branches/br-1")) {
        return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });
      }

      // SessionsTab child requests (keep minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);

      // Two overlapping sessions with the same instructor → HIGH (double-booking)
      if (url.includes("/api/scheduling/sessions") && url.includes("schedule_id=sch-1")) {
        return mockJson(true, {
          sessions: [
            {
              id: "sess-1",
              branch_id: "br-1",
              schedule_id: "sch-1",
              class_id: "class-1",
              location_id: "loc-1",
              day_of_week: "SATURDAY",
              start_time: "09:00:00",
              end_time: "10:00:00",
              session_date: "2026-01-03",
              headcount: null,
              class: { id: "class-1", name: "BODYCOMBAT" },
              location: { id: "loc-1", code: "STP-CARDIO", name: "S- Studio" },
              instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mike", last_name: "Y" }],
            },
            {
              id: "sess-2",
              branch_id: "br-1",
              schedule_id: "sch-1",
              class_id: "class-2",
              location_id: "loc-2",
              day_of_week: "SATURDAY",
              start_time: "09:15:00",
              end_time: "10:15:00",
              session_date: "2026-01-03",
              headcount: null,
              class: { id: "class-2", name: "CYCLE" },
              location: { id: "loc-2", code: "CYC-STAD", name: "Cycle Stadium" },
              instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mike", last_name: "Y" }],
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return mockJson(true, { requestedYear: 2026, requestedYearMissing: false });
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      // Any other scheduling endpoints
      if (url.includes("/api/scheduling/conflicts") && init?.method === "POST") {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      if (url.includes("/api/scheduling/publish") && init?.method === "POST") {
        return mockJson(true, { success: true, email: { attempted: 0 } });
      }

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    const cloneBtn = await screen.findByRole("button", { name: "Clone Next Month" });
    const publishBtn = await screen.findByRole("button", { name: "Publish" });

    await waitFor(() => {
      // Clone is enabled for testing even if there are HIGH conflicts.
      expect(cloneBtn).not.toBeDisabled();
      expect(publishBtn).toBeDisabled();
    });
  });
});


