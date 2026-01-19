import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

describe("SessionsTab column filter indicators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("marks the Class filter icon as active only when narrowing", async () => {
    const sessions = [
      {
        id: "sess-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "SATURDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-03",
        headcount: null,
        class: { id: "cls-1", name: "BODYPUMP™" },
        location: { id: "loc-1", code: "S", name: "Studio" },
        instructors: [{ id: "inst-1", nickname: "JENN W", first_name: "Jenn", last_name: "W", readable_id: "I001" }],
      },
      {
        id: "sess-2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-2",
        location_id: "loc-1",
        day_of_week: "SATURDAY",
        start_time: "09:00:00",
        end_time: "10:00:00",
        session_date: "2026-01-03",
        headcount: null,
        class: { id: "cls-2", name: "AQUAFIT" },
        location: { id: "loc-1", code: "S", name: "Studio" },
        instructors: [{ id: "inst-2", nickname: "MIKEY", first_name: "Mikey", last_name: "M", readable_id: "I002" }],
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
      if (url.includes("/api/scheduling/conflicts")) return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SessionsTab scheduleId="sch-1" branchId="br-1" programGroupId="pg-1" refreshKey={1} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Baseline: not active (empty selection means "all")
    expect(screen.getByRole("button", { name: "Filter Class" })).toBeInTheDocument();

    // Open filter
    fireEvent.click(screen.getByRole("button", { name: "Filter Class" }));

    // Click a single class checkbox (narrowing)
    const targetLabel = screen.getByText("AQUAFIT").closest("label");
    expect(targetLabel).toBeTruthy();
    const checkbox = targetLabel?.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);

    // Active indicator should flip
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Filter Class (active)" })).toBeInTheDocument();
    });
  });

  it("filters Instructor(s) by individual instructor selection (includes multi-instructor sessions)", async () => {
    const sessions = [
      {
        id: "sess-1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-1",
        location_id: "loc-1",
        day_of_week: "SATURDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-03",
        headcount: null,
        class: { id: "cls-1", name: "BODYPUMP™" },
        location: { id: "loc-1", code: "S", name: "Studio" },
        instructors: [{ id: "inst-1", nickname: "JENN W", first_name: "Jenn", last_name: "W", readable_id: "I001" }],
      },
      {
        id: "sess-2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "cls-2",
        location_id: "loc-1",
        day_of_week: "SUNDAY",
        start_time: "09:30:00",
        end_time: "10:30:00",
        session_date: "2026-01-04",
        headcount: null,
        class: { id: "cls-2", name: "BODYBALANCE™" },
        location: { id: "loc-1", code: "S", name: "Studio" },
        instructors: [
          { id: "inst-1", nickname: "JENN W", first_name: "Jenn", last_name: "W", readable_id: "I001" },
          { id: "inst-3", nickname: "ROBERT", first_name: "Robert", last_name: "R", readable_id: "I003" },
        ],
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
        return mockJson(true, { summary: { high: 0, medium: 0, low: 0, total: 0 }, conflicts: [] });
      }
      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SessionsTab scheduleId="sch-1" branchId="br-1" programGroupId="pg-1" refreshKey={1} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Open Instructor filter popover
    fireEvent.click(screen.getByRole("button", { name: "Filter Instructor" }));

    const selectAll = screen.getByText("Select All");
    const popover = selectAll.closest('[data-slot="popover-content"]') as HTMLElement | null;
    expect(popover).toBeTruthy();

    // Dropdown should list individual instructors
    expect(popover!).toHaveTextContent("JENN W");
    expect(popover!).toHaveTextContent("ROBERT");
    expect(popover!).not.toHaveTextContent("JENN W, ROBERT");

    // Select JENN W (narrowing)
    const jennLabel = screen.getByText("JENN W").closest("label");
    expect(jennLabel).toBeTruthy();
    const checkbox = jennLabel?.querySelector("input[type='checkbox']") as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    fireEvent.click(checkbox!);

    // Results should include both the solo and multi-instructor session.
    await waitFor(() => {
      expect(screen.getByText("JENN W, ROBERT")).toBeInTheDocument();
      expect(screen.getAllByText("JENN W").length).toBeGreaterThan(0);
    });
  });
});

