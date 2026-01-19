import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/react";

import { SessionsTab } from "@/app/scheduling/sessions-tab";

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

describe("SessionsTab conflicts UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows conflict badges for overlapping sessions and disables save on HIGH conflicts", async () => {
    const sessions = [
      {
        id: "sess-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-06",
        headcount: null,
        class: { id: "cls-1", name: "BODYCOMBAT" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-1", nickname: "Nick", first_name: "Nick", last_name: "N", readable_id: "I001" }],
      },
      {
        id: "sess-2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-2",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:30:00",
        end_time: "09:30:00",
        session_date: "2026-01-06",
        headcount: null,
        class: { id: "cls-2", name: "BODYPUMP" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-2", nickname: "Ana", first_name: "Ana", last_name: "A", readable_id: "I002" }],
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions });
      }
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 1, medium: 0, low: 0, total: 1 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Two sessions participating in one HIGH location double-booking => badge for each row.
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Conflicts HIGH/i).length).toBeGreaterThanOrEqual(2);
    });

    const editButtons = screen.getAllByLabelText("Edit session");
    expect(editButtons.length).toBeGreaterThan(0);
    fireEvent.click(editButtons[0]);

    const dialog = await screen.findByRole("dialog", { name: "Edit session" });

    // Save should be disabled because the edited session is currently in HIGH conflicts.
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Save session")).toBeDisabled();
    });

    // Existing session conflicts are shown at the bottom of the edit modal.
    expect(within(dialog).getByText(/Current conflicts \(this session\):/i)).toBeInTheDocument();
  });

  it("requires confirmation before saving when there are MEDIUM conflicts (no HIGH)", async () => {
    const sessions = [
      {
        id: "sess-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-a",
        day_of_week: "MONDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-1", name: "A" },
        location: { id: "loc-a", code: "A", name: "Room A" },
        instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M", readable_id: "I001" }],
      },
      {
        id: "sess-2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-2",
        location_id: "loc-b",
        day_of_week: "MONDAY",
        start_time: "09:05:00",
        end_time: "10:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-2", name: "B" },
        location: { id: "loc-b", code: "B", name: "Room B" },
        instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M", readable_id: "I001" }],
      },
    ];

    let putCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions });
      }
      if (url.includes("/api/scheduling/sessions") && init?.method === "PUT") {
        putCalls += 1;
        return mockJson(true, { ok: true });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 1, low: 0, total: 1 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Edit a session that participates in MEDIUM transition warnings.
    fireEvent.click(screen.getAllByLabelText("Edit session")[0]);

    const dialog = await screen.findByRole("dialog", { name: "Edit session" });

    // Save should NOT be disabled (MEDIUM is confirmable).
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Save session")).not.toBeDisabled();
    });

    fireEvent.click(within(dialog).getByLabelText("Save session"));

    // Should show confirmation modal and not call PUT yet.
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /confirm medium conflicts/i })).toBeInTheDocument();
    });
    expect(putCalls).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(putCalls).toBe(1);
    });
  });

  it("shows instructor availability in the Add Session modal (no rules => available any time)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, { classes: [{ id: "cls-1", name: "UPBEAT BARRE™" }] });
      if (url.includes("/api/maintenance/locations")) return mockJson(true, { locations: [{ id: "loc-1", code: "A", name: "Room A" }] });
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
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions: [] });
      }
      if (url.includes("/api/scheduling/instructor-availability")) {
        return mockJson(true, { availability: [] }); // no rules => available any time
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/branches/")) return mockJson(true, { name: "Eastside Family YMCA" });
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

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

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));

    const helper = await screen.findByRole("dialog", { name: "Add session helper" });
    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "UPBEAT BARRE™" }));

    // Wait for auto-search to finish and pick a slot.
    await waitFor(() => {
      expect(within(helper).queryByText(/Searching\.\.\./i)).not.toBeInTheDocument();
    });
    const slotBtn = (await within(helper).findAllByRole("button", { name: /06:00 AM–07:00 AM/i }))[0];
    fireEvent.click(slotBtn);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    const dialog = await screen.findByRole("dialog", { name: "Add session" });
    expect(within(dialog).getByText(/Instructor availability/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(within(dialog).getByText(/available any time/i)).toBeInTheDocument();
    });
  }, 15000);

  it("prefills Add Session from the Add Session Helper selection (OK flow)", async () => {
    let mappingCalls = 0;
    let sessionsGetCalls = 0;
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
        mappingCalls += 1;
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
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        sessionsGetCalls += 1;
        return mockJson(true, { sessions: [] });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

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

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    // Acceptance criteria: mapping is fetched once on helper open (not on subsequent selections).
    await waitFor(() => {
      expect(mappingCalls).toBe(1);
    });
    // Acceptance criteria: heavy schedule table is hidden while helper is open (prevents laggy rerenders).
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    // Select class (enables instructor options based on mapping)
    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "UPBEAT BARRE™" }));

    // Singleton instructor/location should auto-select after class selection.
    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: /MIKEY/i })).toBeInTheDocument();
      expect(within(helper).getByRole("button", { name: "A - Room A" })).toBeInTheDocument();
    });

    // Wait for any auto-search to finish so dropdown is clickable again.
    await waitFor(() => {
      expect(within(helper).queryByText(/Searching\.\.\./i)).not.toBeInTheDocument();
    });

    // Acceptance criteria: reopening class dropdown shows the selected item (marked data-selected=true).
    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    const selectedClassBtn = await screen.findByRole("button", { name: "UPBEAT BARRE™" });
    expect(selectedClassBtn).toHaveAttribute("data-selected", "true");
    fireEvent.click(selectedClassBtn); // close by selecting again

    // Location dropdown is a singleton and should be disabled (no need to reopen).
    expect(within(helper).getByRole("button", { name: "A - Room A" })).toBeDisabled();

    expect(mappingCalls).toBe(1);
    expect(sessionsGetCalls).toBe(1);

    // Duration is constrained by mapping (singleton) and should auto-select to 60 (disabled UI).
    const durationControl = within(helper).getByLabelText("Select duration");
    expect(durationControl).toHaveTextContent(/60 minutes/i);
    expect(durationControl).toBeDisabled();

    // Pick any available 60-min slot in the 06:00–07:00 window (first occurrence is 2026-01-01).
    // Slots may appear after an initial auto-search completes.
    const slotBtn = (await within(helper).findAllByRole("button", { name: /06:00 AM–07:00 AM/i }))[0];
    fireEvent.click(slotBtn);

    // Confirm
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    const dialog = await screen.findByRole("dialog", { name: "Add session" });
    expect(within(dialog).getByDisplayValue("06:00")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("07:00")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("2026-01-01")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "UPBEAT BARRE™" })).toBeInTheDocument();
  }, 15000);

  it("shows unique instructor nicknames for a selected class (mapping-driven)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) {
        return mockJson(true, { classes: [{ id: "cls-cd", name: "CARDIO DANCE" }] });
      }
      if (url.includes("/api/maintenance/locations")) {
        return mockJson(true, {
          locations: [
            { id: "loc-mb", code: "MB", name: "Mind Body" },
            { id: "loc-st", code: "ST", name: "Studio" },
          ],
        });
      }
      if (url.includes("/api/maintenance/instructors")) {
        return mockJson(true, { instructors: [] });
      }
      if (url.includes("/api/scheduling/instructor-class-location-details")) {
        return mockJson(true, {
          rows: [
            // duplicate-ish rows across locations/durations; should dedupe instructor list
            {
              class_id: "cls-cd",
              class_name: "CARDIO DANCE",
              instructor_id: "inst-brit",
              instructor_nickname: "BRIT C",
              location_id: "loc-mb",
              location_name: "Mind Body",
              minutes: 60,
            },
            {
              class_id: "cls-cd",
              class_name: "CARDIO DANCE",
              instructor_id: "inst-carol",
              instructor_nickname: "CAROL",
              location_id: "loc-st",
              location_name: "Studio",
              minutes: 45,
            },
            {
              class_id: "cls-cd",
              class_name: "CARDIO DANCE",
              instructor_id: "inst-lisa",
              instructor_nickname: "LISA B",
              location_id: "loc-st",
              location_name: "Studio",
              minutes: 45,
            },
            {
              class_id: "cls-cd",
              class_name: "CARDIO DANCE",
              instructor_id: "inst-sam",
              instructor_nickname: "SAM R",
              location_id: "loc-mb",
              location_name: "Mind Body",
              minutes: 45,
            },
            // Same instructor again (different minutes)
            {
              class_id: "cls-cd",
              class_name: "CARDIO DANCE",
              instructor_id: "inst-brit",
              instructor_nickname: "BRIT C",
              location_id: "loc-mb",
              location_name: "Mind Body",
              minutes: 45,
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions: [] });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "CARDIO DANCE" }));

    const instructorTrigger = within(helper).getByRole("button", { name: "Select instructor(s)..." });
    expect(instructorTrigger).toBeEnabled();
    fireEvent.click(instructorTrigger);
    expect(await screen.findByRole("button", { name: "BRIT C" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CAROL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LISA B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SAM R" })).toBeInTheDocument();
  });

  it("shows 'Select location...' prompt (enabled) when multiple locations exist", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, { classes: [{ id: "cls-1", name: "TEST CLASS" }] });
      if (url.includes("/api/maintenance/locations")) {
        return mockJson(true, {
          locations: [
            { id: "loc-a", code: "A", name: "Room A" },
            { id: "loc-b", code: "B", name: "Room B" },
          ],
        });
      }
      if (url.includes("/api/maintenance/instructors")) {
        return mockJson(true, {
          instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M", readable_id: "I001" }],
        });
      }
      if (url.includes("/api/scheduling/instructor-class-location-details")) {
        return mockJson(true, {
          rows: [
            { class_id: "cls-1", class_name: "TEST CLASS", instructor_id: "inst-1", instructor_nickname: "MIKEY", location_id: "loc-a", location_name: "Room A", minutes: 60 },
            { class_id: "cls-1", class_name: "TEST CLASS", instructor_id: "inst-1", instructor_nickname: "MIKEY", location_id: "loc-b", location_name: "Room B", minutes: 60 },
          ],
        });
      }
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SessionsTab scheduleId="sch-1" branchId="br-1" programGroupId="pg-1" refreshKey={1} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "TEST CLASS" }));

    // Singleton instructor auto-selects.
    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: /MIKEY/i })).toBeInTheDocument();
    });

    const locationTrigger = within(helper).getByRole("button", { name: "Select location..." });
    expect(locationTrigger).toBeEnabled();
  }, 15000);

  it("refreshes available time slots when duration changes (same class)", async () => {
    let mappingCalls = 0;
    let sessionsGetCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) {
        return mockJson(true, { classes: [{ id: "cls-cd", name: "CARDIO DANCE" }] });
      }
      if (url.includes("/api/maintenance/locations")) {
        return mockJson(true, { locations: [{ id: "loc-1", code: "S", name: "Studio" }] });
      }
      if (url.includes("/api/maintenance/instructors")) {
        return mockJson(true, {
          instructors: [
            { id: "inst-1", nickname: "LISA B", first_name: "Lisa", last_name: "B", readable_id: "I001" },
          ],
        });
      }
      if (url.includes("/api/scheduling/instructor-class-location-details")) {
        mappingCalls += 1;
        return mockJson(true, {
          rows: [
            {
              class_id: "cls-cd",
              class_name: "CARDIO DANCE",
              class_label: "CARDIO DANCE",
              instructor_id: "inst-1",
              instructor_nickname: "LISA B",
              instructor_label: "LISA B",
              location_id: "loc-1",
              location_name: "Studio",
              location_label: "S - Studio",
              minutes: 45,
            },
            {
              class_id: "cls-cd",
              class_name: "CARDIO DANCE",
              class_label: "CARDIO DANCE",
              instructor_id: "inst-1",
              instructor_nickname: "LISA B",
              instructor_label: "LISA B",
              location_id: "loc-1",
              location_name: "Studio",
              location_label: "S - Studio",
              minutes: 60,
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        sessionsGetCalls += 1;
        return mockJson(true, { sessions: [] });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2025, month: 12 }}
        availabilityTimeStart="06:00"
        availabilityTimeEnd="07:00"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    await waitFor(() => {
      expect(mappingCalls).toBe(1);
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    // Select class
    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "CARDIO DANCE" }));

    // Singleton instructor/location auto-select.
    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: "LISA B" })).toBeInTheDocument();
      expect(within(helper).getByRole("button", { name: "S - Studio" })).toBeInTheDocument();
    });

    expect(mappingCalls).toBe(1);
    expect(sessionsGetCalls).toBe(1);

    // Multiple durations => should require explicit selection.
    // Duration picker is a themed PopoverSelect (button trigger), not a native <select>.
    const durationTrigger = within(helper).getByRole("button", { name: "Select duration" });

    // Pick 60 first => since durations aren't singleton, helper should require manual refresh (no auto-search).
    fireEvent.click(durationTrigger);
    fireEvent.click(await screen.findByRole("button", { name: "60 minutes" }));

    await waitFor(() => {
      expect(within(helper).getByText(/Select Refresh for Available Time Slots/i)).toBeInTheDocument();
    });
    expect(within(helper).queryByRole("button", { name: /06:00 AM–07:00 AM/i })).not.toBeInTheDocument();

    const refreshBtn0 = within(helper).getByRole("button", { name: "Refresh available time slots" });
    expect(refreshBtn0).toBeEnabled();
    fireEvent.click(refreshBtn0);

    await waitFor(() => {
      expect(within(helper).queryByText(/Select Refresh for Available Time Slots/i)).not.toBeInTheDocument();
    });
    expect((await within(helper).findAllByRole("button", { name: /06:00 AM–07:00 AM/i })).length).toBeGreaterThan(0);

    // Change duration to 45 => slots should clear and require manual Refresh.
    fireEvent.click(within(helper).getByRole("button", { name: "Select duration" }));
    fireEvent.click(await screen.findByRole("button", { name: "45 minutes" }));

    await waitFor(() => {
      expect(within(helper).getByText(/Select Refresh for Available Time Slots/i)).toBeInTheDocument();
    });

    const refreshBtn = within(helper).getByRole("button", { name: "Refresh available time slots" });
    expect(refreshBtn).toBeEnabled();
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(within(helper).queryByText(/Select Refresh for Available Time Slots/i)).not.toBeInTheDocument();
      expect(within(helper).getAllByRole("button", { name: /06:00 AM–06:45 AM/i }).length).toBeGreaterThan(0);
      expect(within(helper).queryAllByRole("button", { name: /06:00 AM–07:00 AM/i }).length).toBe(0);
    });
  }, 15000);

  it("formats slot dates as MM/DD/YYYY in the Available time slots panel", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) {
        return mockJson(true, { classes: [{ id: "cls-1", name: "TEST CLASS" }] });
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
              class_name: "TEST CLASS",
              class_label: "TEST CLASS",
              instructor_id: "inst-1",
              instructor_nickname: "MIKEY",
              instructor_label: "MIKEY",
              location_id: "loc-1",
              location_name: "Room A",
              location_label: "A - Room A",
              minutes: 60,
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

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

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "TEST CLASS" }));

    // Singleton instructor/location auto-select.
    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: /MIKEY/i })).toBeInTheDocument();
      expect(within(helper).getByRole("button", { name: "A - Room A" })).toBeInTheDocument();
    });

    // Slots should show a day header with MM/DD/YYYY somewhere (e.g., "SAT 01/01/2026")
    await waitFor(() => {
      expect(within(helper).getAllByText(/\b\d{2}\/\d{2}\/\d{4}\b/).length).toBeGreaterThan(0);
    });
  }, 15000);

  it("uses 0–20 minute transition/turnover in 5-minute increments and defaults to 0", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, { classes: [] });
      if (url.includes("/api/maintenance/locations")) return mockJson(true, { locations: [] });
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, { instructors: [] });
      if (url.includes("/api/scheduling/instructor-class-location-details")) return mockJson(true, { rows: [] });
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SessionsTab scheduleId="sch-1" branchId="br-1" programGroupId="pg-1" refreshKey={1} />);

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    const transition = within(helper).getByRole("combobox", { name: "Select transition" }) as HTMLSelectElement;
    const turnover = within(helper).getByRole("combobox", { name: "Select turnover" }) as HTMLSelectElement;

    const transitionValues = Array.from(transition.options).map((o) => o.value);
    const turnoverValues = Array.from(turnover.options).map((o) => o.value);

    expect(transitionValues).toEqual(["0", "5", "10", "15", "20"]);
    expect(turnoverValues).toEqual(["0", "5", "10", "15", "20"]);
    expect(transition.value).toBe("0");
    expect(turnover.value).toBe("0");
  }, 15000);

  it("auto-selects singleton instructor, location, and duration after class selection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, { classes: [{ id: "cls-1", name: "ONE-ONLY" }] });
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
              class_name: "ONE-ONLY",
              instructor_id: "inst-1",
              instructor_nickname: "MIKEY",
              location_id: "loc-1",
              location_name: "Room A",
              minutes: 60,
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

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

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    // Select class
    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "ONE-ONLY" }));

    // Instructor and Location should auto-select (trigger labels update).
    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: /MIKEY/i })).toBeInTheDocument();
      expect(within(helper).getByRole("button", { name: "A - Room A" })).toBeInTheDocument();
    });

    // Singleton dropdowns should be disabled.
    expect(within(helper).getByRole("button", { name: /MIKEY/i })).toBeDisabled();
    expect(within(helper).getByRole("button", { name: "A - Room A" })).toBeDisabled();

    // Duration should auto-select to 60 and be disabled (only one option).
    const durationControl = within(helper).getByLabelText("Select duration");
    expect(durationControl).toHaveTextContent(/60 minutes/i);
    expect(durationControl).toBeDisabled();
  }, 15000);

  it("enables Review when time slots are checked and shows a review modal list", async () => {
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
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      if (url.includes("/api/branches/")) return mockJson(true, { name: "Eastside Family YMCA" });
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

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

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    const reviewBtn = within(helper).getByRole("button", { name: "Review" });
    expect(reviewBtn).toBeDisabled();

    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "UPBEAT BARRE™" }));

    // Auto-select singleton instructor/location/duration, and auto-search should run.
    await waitFor(() => {
      expect(within(helper).queryByText(/Searching\.\.\./i)).not.toBeInTheDocument();
    });

    const slotBtn = (await within(helper).findAllByRole("button", { name: /06:00 AM–07:00 AM/i }))[0];
    fireEvent.click(slotBtn);

    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: "Review" })).toBeEnabled();
    });

    fireEvent.click(within(helper).getByRole("button", { name: "Review" }));
    const reviewDialog = await screen.findByRole("dialog", { name: "Review selected time slots" });
    expect(within(reviewDialog).getByText(/01\/01\/2026/i)).toBeInTheDocument();
  }, 15000);

  it.skip("shows slot review email/response status + response summary in the Review popup", async () => {
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
      if (url.includes("/api/scheduling/slot-helper-review/requests")) {
        return mockJson(true, {
          requests: [
            {
              id: "req-1",
              created_at: "2026-01-15T00:00:00Z",
              expires_at: "2099-01-17T00:00:00Z",
              sent_at: "2026-01-15T00:00:00Z",
              responded_at: "2026-01-15T01:00:00Z",
              completed_at: null,
              overridden_at: null,
              class_id: "cls-1",
              location_id: "loc-1",
              instructor_ids: ["inst-1"],
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/slot-helper-review/request-detail")) {
        return mockJson(true, {
          expired: false,
          request: {
            id: "req-1",
            created_at: "2026-01-15T00:00:00Z",
            expires_at: "2099-01-17T00:00:00Z",
            sent_at: "2026-01-15T00:00:00Z",
            responded_at: "2026-01-15T01:00:00Z",
            completed_at: null,
            overridden_at: null,
            class_id: "cls-1",
            location_id: "loc-1",
            instructor_ids: ["inst-1"],
            response_comment: "Please avoid 7am.",
            response_selected_hold_ids: ["hold-2"],
          },
          email: {
            sent_at: "2026-01-15T00:00:00Z",
            from_email: "sched@example.com",
            to_email: "don.race@outlook.com",
            subject: "Eastside Family YMCA — Slot Review Requested (January 2026)",
            message_id: "m1",
          },
          holds: [
            {
              id: "hold-1",
              request_id: "req-1",
              class_id: "cls-1",
              location_id: "loc-1",
              instructor_ids: ["inst-1"],
              slot_date: "2026-01-01",
              start_time: "06:00",
              end_time: "07:00",
            },
            {
              id: "hold-2",
              request_id: "req-1",
              class_id: "cls-1",
              location_id: "loc-1",
              instructor_ids: ["inst-1"],
              slot_date: "2026-01-01",
              start_time: "07:00",
              end_time: "08:00",
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/slot-helper-review/holds")) return mockJson(true, { holds: [] });
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      if (url.includes("/api/branches/")) return mockJson(true, { name: "Eastside Family YMCA" });
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
        availabilityTimeStart="06:00"
        availabilityTimeEnd="08:00"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    fireEvent.click(within(helper).getByRole("button", { name: "Select Class" }));
    fireEvent.click(await screen.findByRole("button", { name: "UPBEAT BARRE™" }));
    await waitFor(() => {
      expect(within(helper).queryByText(/Searching\.\.\./i)).not.toBeInTheDocument();
    });

    // Select a request so Review popup shows email/response details.
    fireEvent.click(within(helper).getByRole("button", { name: "Select slot helper request" }));
    fireEvent.click(await screen.findByRole("button", { name: /Responded/i }));

    // Select the first slot (06–07) so Review becomes enabled.
    const firstSlot = (await within(helper).findAllByRole("button", { name: /06:00 AM–07:00 AM/i }))[0];
    fireEvent.click(firstSlot);
    fireEvent.click(within(helper).getByRole("button", { name: "Review" }));

    const reviewDialog = await screen.findByRole("dialog", { name: "Review selected time slots" });
    expect(within(reviewDialog).getByText(/Sent/i)).toBeInTheDocument();
    expect(within(reviewDialog).getByText(/Received/i)).toBeInTheDocument();
    expect(within(reviewDialog).getByText(/Please avoid 7am\./i)).toBeInTheDocument();
    expect(within(reviewDialog).getByText(/01\/01\/2026 • 07:00 AM–08:00 AM/i)).toBeInTheDocument();
  }, 15000);

  it("enables Reschedule button when the same instructor has availability HIGH conflicts in other sessions (same schedule)", async () => {
    const sessions = [
      {
        id: "sess-a",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-a",
        day_of_week: "SATURDAY",
        start_time: "07:15:00",
        end_time: "07:45:00",
        session_date: "2026-01-03",
        headcount: null,
        class: { id: "cls-1", name: "GRIT" },
        location: { id: "loc-a", code: "A", name: "Room A" },
        instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M", readable_id: "I001" }],
      },
      {
        id: "sess-b",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-a",
        day_of_week: "SATURDAY",
        start_time: "07:15:00",
        end_time: "07:45:00",
        session_date: "2026-01-10",
        headcount: null,
        class: { id: "cls-1", name: "GRIT" },
        location: { id: "loc-a", code: "A", name: "Room A" },
        instructors: [{ id: "inst-1", nickname: "MIKEY", first_name: "Mikey", last_name: "M", readable_id: "I001" }],
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions });
      }
      if (url.includes("/api/scheduling/reschedule-feedback/status")) {
        return mockJson(true, {
          email: null,
          request: {
            created_at: "2026-01-15T00:00:00Z",
            expires_at: "2026-01-17T00:00:00Z",
            responded_at: "2026-01-15T01:00:00Z",
            response_selected_session_ids: ["sess-a"],
          },
          instructor_email: "mikey@example.com",
        });
      }
      if (url.includes("/api/scheduling/instructor-availability")) {
        // Instructor has SOME availability windows in the month, but none on Saturday => HIGH outside availability.
        return mockJson(true, {
          availability: [
            {
              id: "av-1",
              instructor_id: "inst-1",
              schedule_month: "2026-01",
              day_of_week: "MONDAY",
              available_start: "09:00:00",
              available_end: "10:00:00",
            },
          ],
        });
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 2, medium: 0, low: 0, total: 2 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByLabelText("Edit session")[0]);

    const dialog = await screen.findByRole("dialog", { name: "Edit session" });

    const reschedule = within(dialog).getByRole("button", { name: /reschedule/i });
    expect(reschedule).not.toBeDisabled();
    expect(within(reschedule).getByText("2")).toBeInTheDocument();

    fireEvent.click(reschedule);

    const preview = await screen.findByRole("dialog", { name: "Reschedule preview" });
    expect(within(preview).getByText(/Current Schedule/i)).toBeInTheDocument();
    expect(within(preview).getByText(/Availability to Reschedule/i)).toBeInTheDocument();
    expect(within(preview).getByText(/Instructor availability/i)).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /select all reschedulable sessions/i })).toBeInTheDocument();
    expect(within(preview).getByRole("button", { name: /email reschedule preview to instructor/i })).toBeDisabled();
    await waitFor(() => {
      expect(within(preview).getByText(/Instructor selected/i)).toBeInTheDocument();
    });

    // Original sessions are listed.
    expect(within(preview).getAllByText(/Saturday Jan 3 2026/i).length).toBeGreaterThanOrEqual(1);
    expect(within(preview).getByText(/Saturday Jan 10 2026/i)).toBeInTheDocument();

    // A proposal within the instructor's availability month is shown (at least one row).
    expect(within(preview).getAllByText(/Monday Jan 5 2026/i).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(within(preview).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Reschedule preview" })).not.toBeInTheDocument();
    });
  });

  it("filters the grid via risk pills (HIGH then RESET) using per-session counts", async () => {
    const sessions = [
      // Two sessions => HIGH (location double-booking)
      {
        id: "sess-high-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-1", name: "BODYCOMBAT" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-1", nickname: "Nick", first_name: "Nick", last_name: "N", readable_id: "I001" }],
      },
      {
        id: "sess-high-2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-2",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:30:00",
        end_time: "09:30:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-2", name: "BODYPUMP" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-2", nickname: "Ana", first_name: "Ana", last_name: "A", readable_id: "I002" }],
      },
      // One session => LOW (informational holiday on that date)
      {
        id: "sess-low-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-3",
        location_id: "loc-2",
        day_of_week: "MONDAY",
        start_time: "10:00:00",
        end_time: "11:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-3", name: "YOGA" },
        location: { id: "loc-2", code: "STUDIO-B", name: "Studio B" },
        instructors: [{ id: "inst-3", nickname: "Lee", first_name: "Lee", last_name: "L", readable_id: "I003" }],
      },
    ];

    const holidays = [
      {
        id: "hol-1",
        holiday_date: "2026-01-05",
        observed_date: null,
        name: "Test Holiday",
        is_active: true,
        is_closed: false,
        closed_start_time: null,
        closed_end_time: null,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, holidays);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 1, medium: 0, low: 1, total: 2 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
      />,
    );

    // Wait for sessions to render (loading state cleared)
    await screen.findByText("BODYCOMBAT");

    // Wait for conflict detection to run (HIGH conflict badges present)
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Conflicts HIGH/i).length).toBeGreaterThanOrEqual(2);
    });

    // Wait for the pill counts to reflect per-session severities.
    const highPill = screen.getByRole("button", { name: /show only show stopper conflicts/i });
    await waitFor(() => {
      expect(within(highPill).getByText("2")).toBeInTheDocument();
    });

    // Baseline: shows all sessions (RESET by default)
    expect(screen.getByText(/3 of 3 sessions/i)).toBeInTheDocument();
    expect(screen.getByText("YOGA")).toBeInTheDocument();

    // Filter to HIGH-only => drops the LOW session
    fireEvent.click(highPill);
    expect(screen.getByText(/2 of 3 sessions/i)).toBeInTheDocument();
    expect(screen.queryByText("YOGA")).not.toBeInTheDocument();

    // Reset => shows all again
    fireEvent.click(screen.getByRole("button", { name: /show schedule \+ conflicts/i }));
    expect(screen.getByText(/3 of 3 sessions/i)).toBeInTheDocument();
    expect(screen.getByText("YOGA")).toBeInTheDocument();
  });

  it("shows conflict explanation popover on hover/focus and opens edit on row click", async () => {
    const sessions = [
      {
        id: "sess-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-1", name: "BODYCOMBAT" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-1", nickname: "Nick", first_name: "Nick", last_name: "N", readable_id: "I001" }],
      },
      {
        id: "sess-2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-2",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:30:00",
        end_time: "09:30:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-2", name: "BODYPUMP" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-2", nickname: "Ana", first_name: "Ana", last_name: "A", readable_id: "I002" }],
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 1, medium: 0, low: 0, total: 1 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
      />,
    );

    // Wait for conflict badges to appear
    await waitFor(() => {
      expect(screen.getAllByLabelText(/Conflicts HIGH/i).length).toBeGreaterThanOrEqual(2);
    });

    const badge = screen.getAllByLabelText(/Conflicts HIGH/i)[0];

    // Hover => popover shows the conflict explanation
    fireEvent.mouseEnter(badge);
    expect(await screen.findByText(/Location double-booking/i)).toBeInTheDocument();
    fireEvent.mouseLeave(badge);

    // Row click => opens edit UI (shows Save button)
    fireEvent.click(screen.getByText("BODYCOMBAT"));
    expect(await screen.findByRole("dialog", { name: "Edit session" })).toBeInTheDocument();

    // Inline row editing is removed (no time inputs in the grid)
    const table = screen.getByRole("table");
    expect(within(table).queryByDisplayValue("08:00")).not.toBeInTheDocument();
  });

  it("deletes a session from the edit modal after confirmation", async () => {
    let deleted = false;
    const sessions = [
      {
        id: "sess-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-06",
        headcount: null,
        class: { id: "cls-1", name: "BODYCOMBAT" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-1", nickname: "Nick", first_name: "Nick", last_name: "N", readable_id: "I001" }],
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions") && init?.method === "DELETE") {
        deleted = true;
        return mockJson(true, { success: true });
      }
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions: deleted ? [] : sessions });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
      />,
    );

    // Wait for initial row
    await screen.findByText("BODYCOMBAT");

    // Open edit modal
    fireEvent.click(screen.getAllByLabelText("Edit session")[0]);
    const dialog = await screen.findByRole("dialog", { name: "Edit session" });

    // Click delete inside modal => confirm dialog
    fireEvent.click(within(dialog).getByRole("button", { name: /delete/i }));
    const confirm = await screen.findByRole("dialog", { name: /confirm delete session/i });

    // Confirm delete
    fireEvent.click(within(confirm).getByLabelText("Confirm delete"));

    await waitFor(() => {
      expect(deleted).toBe(true);
    });

    // After deletion, list should be empty (no BODYCOMBAT)
    await waitFor(() => {
      expect(screen.queryByText("BODYCOMBAT")).not.toBeInTheDocument();
    });
  });

  it("opens Print Schedule Conflicts modal from PRINT pill", async () => {
    const sessions = [
      {
        id: "sess-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-1", name: "BODYCOMBAT" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-1", nickname: "Nick", first_name: "Nick", last_name: "N", readable_id: "I001" }],
      },
      {
        id: "sess-2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-2",
        location_id: "loc-1",
        day_of_week: "MONDAY",
        start_time: "08:30:00",
        end_time: "09:30:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "cls-2", name: "BODYPUMP" },
        location: { id: "loc-1", code: "STUDIO-A", name: "Studio A" },
        instructors: [{ id: "inst-2", nickname: "Ana", first_name: "Ana", last_name: "A", readable_id: "I002" }],
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 1, medium: 0, low: 0, total: 1 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
      />,
    );

    await screen.findByText("BODYCOMBAT");

    fireEvent.click(screen.getByRole("button", { name: /export a conflict checklist/i }));

    expect(await screen.findByText(/print schedule conflicts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close print conflicts modal/i })).toBeInTheDocument();
  });

  it("populates selections and slots from Email Requests Sent selection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/maintenance/classes")) {
        return mockJson(true, { classes: [{ id: "cls-2", name: "BODYCOMBAT™" }] });
      }
      if (url.includes("/api/maintenance/locations")) {
        return mockJson(true, { locations: [{ id: "loc-2", code: "MB", name: "Mind Body" }] });
      }
      if (url.includes("/api/maintenance/instructors")) {
        return mockJson(true, {
          instructors: [{ id: "inst-2", nickname: "VANESSA", first_name: "Vanessa", last_name: "V" }],
        });
      }
      if (url.includes("/api/scheduling/instructor-class-location-details")) {
        return mockJson(true, {
          rows: [
            {
              class_id: "cls-2",
              class_name: "BODYCOMBAT™",
              instructor_id: "inst-2",
              instructor_nickname: "VANESSA",
              location_id: "loc-2",
              location_name: "Mind Body",
              minutes: 45,
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/slot-helper-review/requests")) {
        return mockJson(true, {
          requests: [
            {
              id: "req-1",
              created_at: "2026-01-17T19:59:00Z",
              expires_at: "2026-01-19T19:59:00Z",
              sent_at: "2026-01-17T20:02:00Z",
              responded_at: null,
              completed_at: null,
              overridden_at: null,
              class_id: "cls-2",
              location_id: "loc-2",
              instructor_ids: ["inst-2"],
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/slot-helper-review/request-detail")) {
        return mockJson(true, {
          expired: false,
          request: {
            id: "req-1",
            created_at: "2026-01-17T19:59:00Z",
            expires_at: "2026-01-19T19:59:00Z",
            sent_at: "2026-01-17T20:02:00Z",
            responded_at: null,
            completed_at: null,
            overridden_at: null,
            class_id: "cls-2",
            location_id: "loc-2",
            instructor_ids: ["inst-2"],
          },
          email: {
            sent_at: "2026-01-17T20:02:00Z",
            from_email: "noreply@example.com",
            to_email: "vanessa@example.com",
            subject: "Slot helper",
            message_id: "msg-1",
          },
          holds: [
            {
              id: "hold-1",
              request_id: "req-1",
              class_id: "cls-2",
              location_id: "loc-2",
              instructor_ids: ["inst-2"],
              slot_date: "2026-01-17",
              start_time: "20:00",
              end_time: "20:45",
            },
          ],
        });
      }
      if (url.includes("/api/scheduling/slot-helper-review/holds")) {
        return mockJson(true, { holds: [] });
      }
      if (url.includes("/api/scheduling/sessions") && (!init || init.method === "GET")) {
        return mockJson(true, { sessions: [] });
      }
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);
      if (url.includes("/api/scheduling/conflicts")) {
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      if (url.includes("/api/branches/")) return mockJson(true, { name: "Eastside Family YMCA" });
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <SessionsTab
        scheduleId="sch-1"
        branchId="br-1"
        programGroupId="pg-1"
        refreshKey={1}
        scheduleMonthYear={{ year: 2026, month: 1 }}
        availabilityTimeStart="06:00"
        availabilityTimeEnd="23:00"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add session" }));
    const helper = await screen.findByRole("dialog", { name: "Add session helper" });

    fireEvent.click(within(helper).getByRole("button", { name: "Select slot helper request" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sent 01\/17\/2026 @/i }));

    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: "Select Class" })).toHaveTextContent("BODYCOMBAT™");
    });

    const durationControl = within(helper).getByLabelText("Select duration");
    expect(durationControl).toHaveTextContent(/45 minutes/i);
    expect(durationControl).toBeDisabled();
    expect(within(helper).getByRole("button", { name: "VANESSA" })).toBeInTheDocument();
    expect(within(helper).getByRole("button", { name: "MB - Mind Body" })).toBeInTheDocument();

    await waitFor(() => {
      expect(within(helper).getByRole("button", { name: /08:00 PM–08:45 PM/i })).toBeInTheDocument();
    });
  });
});

