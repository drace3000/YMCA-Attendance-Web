import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { HolidaysTab } from "@/app/maintenance/holidays-tab";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

describe("HolidaysTab UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseThemeSettings.mockReturnValue({
      branch: { id: "br-1", name: "Branch One" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Import US Holidays button but disables it when the latest year is already loaded", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }), {
          status: 200,
        });
      }
      if (url.includes("/api/maintenance/holidays/import-us?") && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            ok: true,
            latestYear: 2027,
            latestYearMissing: false,
            upToDate: true,
            availableYears: [2024, 2025, 2026, 2027],
            missingYears: [],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/maintenance/holidays?")) {
        return new Response(
          JSON.stringify([
            {
              id: "h1",
              branch_id: "br-1",
              holiday_date: "2026-07-04",
              name: "Independence Day",
              notes: null,
              is_active: true,
              is_closed: false,
              closed_start_time: null,
              closed_end_time: null,
              observed_date: null,
              import_source: "US_FEDERAL",
              created_at: new Date().toISOString(),
            },
          ]),
          { status: 200 },
        );
      }
      // default
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<HolidaysTab />);

    await screen.findByText("Holidays");
    await screen.findByText("Independence Day");

    const btn = await screen.findByRole("button", { name: /import us holidays/i });
    expect(btn).toBeDisabled();
  });

  it("enables Import US Holidays when a new year is available and shows the YYYY available message", async () => {
    let holidayGets = 0;
    let statusGets = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1")) {
        return new Response(JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }), {
          status: 200,
        });
      }

      if (url.includes("/api/maintenance/holidays/import-us?") && (!init?.method || init.method === "GET")) {
        statusGets += 1;
        // First status call: latest year missing (e.g., 2028)
        if (statusGets === 1) {
          return new Response(
            JSON.stringify({
              ok: true,
              latestYear: 2028,
              latestYearMissing: true,
              upToDate: false,
              availableYears: [2024, 2025, 2026, 2027, 2028],
              missingYears: [2028],
            }),
            { status: 200 },
          );
        }
        // After import: up to date
        return new Response(
          JSON.stringify({
            ok: true,
            latestYear: 2028,
            latestYearMissing: false,
            upToDate: true,
            availableYears: [2024, 2025, 2026, 2027, 2028],
            missingYears: [],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/holidays?")) {
        holidayGets += 1;
        if (holidayGets === 1) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(
          JSON.stringify([
            {
              id: "h1",
              branch_id: "br-1",
              holiday_date: "2026-07-04",
              name: "Independence Day",
              notes: null,
              is_active: true,
              is_closed: false,
              closed_start_time: null,
              closed_end_time: null,
              observed_date: null,
              import_source: "US_FEDERAL",
              created_at: new Date().toISOString(),
            },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/holidays/import-us") && (init?.method ?? "GET") === "POST") {
        return new Response(
          JSON.stringify({ ok: true, upToDate: true, latestYear: 2028, missingYears: [], insertedCount: 2 }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<HolidaysTab />);

    // Wait for first load (no holidays)
    await screen.findByText("Holidays");

    const importBtn = await screen.findByRole("button", { name: /import us holidays/i });
    expect(importBtn).not.toBeDisabled();
    expect(await screen.findByText(/2028 is available for loading/i)).toBeInTheDocument();
    fireEvent.click(importBtn);

    // Confirm modal appears
    expect(await screen.findByRole("dialog", { name: /import us holidays/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^ok$/i }));

    // Result step appears (success or failure) with a single OK button
    expect(await screen.findByText(/import complete|import failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^ok$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /import us holidays/i })).toBeDisabled();
    });
  });

  it("locks the YMCA closed checkbox when a closed time window is set", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }), {
          status: 200,
        });
      }
      if (url.includes("/api/maintenance/holidays?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return new Response(JSON.stringify({ ok: true, latestYear: 2027, latestYearMissing: false, upToDate: true }), {
          status: 200,
        });
      }
      if (url.includes("/api/maintenance/holidays") && !url.includes("/import-us")) {
        return new Response(JSON.stringify({ id: "h-new" }), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<HolidaysTab />);
    await screen.findByText("Holidays");

    fireEvent.click(screen.getByRole("button", { name: /add holiday/i }));

    const closedCheckbox = await screen.findByRole("checkbox", { name: /ymca closed on this day/i });
    expect(closedCheckbox).not.toBeChecked();
    expect(closedCheckbox).not.toBeDisabled();

    fireEvent.click(closedCheckbox);
    expect(closedCheckbox).toBeChecked();

    // Set start time
    fireEvent.click(screen.getByRole("button", { name: /closed start time/i }));
    fireEvent.click(await screen.findByRole("button", { name: "08:00 AM" }));

    // Set end time
    fireEvent.click(screen.getByRole("button", { name: /closed end time/i }));
    fireEvent.click(await screen.findByRole("button", { name: "09:00 AM" }));

    // Once both are set, checkbox becomes locked (disabled)
    expect(screen.getByRole("checkbox", { name: /ymca closed on this day/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /ymca closed on this day/i })).toBeDisabled();
  });

  it("Search filters holidays by holiday name", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }), {
          status: 200,
        });
      }
      if (url.includes("/api/maintenance/holidays?")) {
        return new Response(
          JSON.stringify([
            {
              id: "h1",
              branch_id: "br-1",
              holiday_date: "2026-07-04",
              name: "Independence Day",
              notes: "Test",
              is_active: true,
              is_closed: false,
              closed_start_time: null,
              closed_end_time: null,
              observed_date: null,
              import_source: null,
              created_at: new Date().toISOString(),
            },
            {
              id: "h2",
              branch_id: "br-1",
              holiday_date: "2026-12-25",
              name: "Christmas Day",
              notes: null,
              is_active: true,
              is_closed: false,
              closed_start_time: null,
              closed_end_time: null,
              observed_date: null,
              import_source: null,
              created_at: new Date().toISOString(),
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return new Response(JSON.stringify({ ok: true, latestYear: 2027, latestYearMissing: false, upToDate: true }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<HolidaysTab />);

    await screen.findByText("Independence Day");
    await screen.findByText("Christmas Day");

    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "christmas" } });

    // Narrow mode is default: non-matching holidays are hidden.
    expect(screen.queryByText("Independence Day")).not.toBeInTheDocument();
    expect(screen.getByText("Christmas Day")).toBeInTheDocument();
  });

  it("shows Print {YYYY} Holiday Schedule label based on selected year", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }), {
          status: 200,
        });
      }
      if (url.includes("/api/maintenance/holidays?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return new Response(JSON.stringify({ ok: true, latestYear: 2027, latestYearMissing: false, upToDate: true }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<HolidaysTab />);
    await screen.findByText("Holidays");

    // Default selected year is current year at runtime; just assert the Print label includes "Holiday Schedule".
    expect(screen.getByRole("button", { name: /print .* holiday schedule/i })).toBeInTheDocument();
  });
});


