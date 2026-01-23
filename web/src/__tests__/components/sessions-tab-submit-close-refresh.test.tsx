import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";

import { SessionsTab } from "@/app/scheduling/sessions-tab";

type FetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

function mockJson(ok: boolean, data: unknown, status = 200): FetchResponse {
  return {
    ok,
    status,
    json: async () => data,
  };
}

describe("SessionsTab Submit Selected Time Slots close refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("forces a DB-fresh sessions reload (no-store) when clicking Close after a successful submit", async () => {
    let bulkAddResolve: ((value: FetchResponse) => void) | null = null;
    const sessionsCalls: Array<{ url: string; init?: RequestInit }> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/maintenance/classes")) {
        return mockJson(true, { classes: [{ id: "cls-1", name: "UPBEAT BARRE™" }] });
      }
      if (url.includes("/api/maintenance/locations")) {
        return mockJson(true, { locations: [{ id: "loc-1", code: "A", name: "Room A" }] });
      }
      if (url.includes("/api/maintenance/instructors")) {
        return mockJson(true, {
          instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M", readable_id: "I001" }],
        });
      }
      if (url.includes("/api/scheduling/instructor-class-location-details")) {
        return mockJson(true, {
          rows: [
            {
              class_id: "cls-1",
              class_name: "UPBEAT BARRE™",
              instructor_id: "inst-1",
              instructor_nickname: "MIKEY",
              location_id: "loc-1",
              location_name: "Room A",
              minutes: 60,
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      if (url.includes("/api/branches/")) return mockJson(true, { name: "Eastside Family YMCA" });

      const method = typeof init?.method === "string" ? init.method.toUpperCase() : "GET";
      if (url.includes("/api/scheduling/sessions") && method === "GET") {
        sessionsCalls.push({ url, init });
        return mockJson(true, { sessions: [] });
      }

      if (url.includes("/api/scheduling/bulk-add-sessions")) {
        return new Promise((resolve) => {
          bulkAddResolve = resolve;
        });
      }

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
        availabilityTimeStart="06:00"
        availabilityTimeEnd="07:00"
      />,
    );

    // Initial load triggers a sessions fetch.
    await waitFor(() => {
      expect(sessionsCalls.length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "UPBEAT BARRE™" }));

    // Wait for any auto-search to finish and pick a slot.
    await waitFor(() => {
      expect(within(helper).queryByText(/Searching\.\.\./i)).not.toBeInTheDocument();
    });

    const slotBtn = (await within(helper).findAllByRole("button", { name: /06:00 AM–07:00 AM/i }))[0];
    fireEvent.click(slotBtn);

    // Open submit modal
    fireEvent.click(within(helper).getByRole("button", { name: /Submit/i }));
    const reviewDialog = await screen.findByRole("dialog", { name: "Submit selected time slots" });

    // Submit
    const submitButton = within(reviewDialog).getByRole("button", { name: "Submit" });
    fireEvent.click(submitButton);

    await act(async () => {
      bulkAddResolve?.(
        mockJson(true, {
          created_session_ids: ["sess-1"],
          email: { ok: true, recipients: ["julie@ymca.org"] },
        }),
      );
    });

    // Close button appears after completion
    const closeButton = await within(reviewDialog).findByRole("button", { name: "Close" });
    fireEvent.click(closeButton);

    // After Close, SessionsTab should re-fetch sessions with cache-bypass.
    await waitFor(() => {
      expect(sessionsCalls.length).toBeGreaterThanOrEqual(2);
    });

    const last = sessionsCalls[sessionsCalls.length - 1];
    expect(last.init?.cache).toBe("no-store");
  }, 15000);
});

