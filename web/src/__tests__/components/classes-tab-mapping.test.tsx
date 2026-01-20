import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { ClassesTab } from "@/app/maintenance/classes-tab";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

describe("ClassesTab mapping sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseThemeSettings.mockReturnValue({
      branch: { id: "br-1", name: "Branch One" },
    });
  });

  it("renders class durations and locations sections in edit mode", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return new Response(
          JSON.stringify({
            groups: [{ id: "pg-1", code: "GroupX", name: "Group X", is_enabled: true }],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/classes?")) {
        return new Response(
          JSON.stringify([
            {
              id: "c1",
              name: "ACTIVE YOGA",
              description: null,
              category: "Yoga",
              is_active: true,
              branch_id: "br-1",
              program_group_id: "pg-1",
              created_at: "2026-01-01",
            },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/locations?")) {
        return new Response(
          JSON.stringify([{ id: "loc-1", code: "ST1", name: "Studio", is_active: true, branch_id: "br-1" }]),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/instructors?")) {
        return new Response(
          JSON.stringify([
            { id: "inst-1", nickname: "CASEY", first_name: "Casey", last_name: "Jones", is_active: true },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/api/scheduling/instructor-class-location-details?")) {
        const isClassOnly = url.includes("class_only=true");
        return new Response(
          JSON.stringify({
            rows: [
              {
                id: isClassOnly ? "m1" : "m1a",
                class_id: "c1",
                instructor_id: isClassOnly ? "ph-1" : "inst-1",
                location_id: "loc-1",
                location_name: "Studio",
                location_label: "ST1 - Studio",
                minutes: 30,
              },
            ],
            placeholder_instructor_id: isClassOnly ? "ph-1" : undefined,
          }),
          { status: 200 },
        );
      }

      if (init?.method === "POST") {
        return new Response(JSON.stringify({ rows: [] }), { status: 201 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<ClassesTab />);

    const editButton = await screen.findByTitle("Edit");
    fireEvent.click(editButton);

    expect(await screen.findByText("Class durations")).toBeInTheDocument();
    expect(await screen.findByText("Class locations")).toBeInTheDocument();
    expect(await screen.findByText("Class instructors")).toBeInTheDocument();
  });

  it("adds a duration by posting class mappings", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return new Response(
          JSON.stringify({
            groups: [{ id: "pg-1", code: "GroupX", name: "Group X", is_enabled: true }],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/classes?")) {
        return new Response(
          JSON.stringify([
            {
              id: "c1",
              name: "ACTIVE YOGA",
              description: null,
              category: "Yoga",
              is_active: true,
              branch_id: "br-1",
              program_group_id: "pg-1",
              created_at: "2026-01-01",
            },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/locations?")) {
        return new Response(
          JSON.stringify([{ id: "loc-1", code: "ST1", name: "Studio", is_active: true, branch_id: "br-1" }]),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/instructors?")) {
        return new Response(
          JSON.stringify([
            { id: "inst-1", nickname: "CASEY", first_name: "Casey", last_name: "Jones", is_active: true },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/api/scheduling/instructor-class-location-details?")) {
        const isClassOnly = url.includes("class_only=true");
        return new Response(
          JSON.stringify({
            rows: [
              {
                id: isClassOnly ? "m1" : "m1a",
                class_id: "c1",
                instructor_id: isClassOnly ? "ph-1" : "inst-1",
                location_id: "loc-1",
                location_name: "Studio",
                location_label: "ST1 - Studio",
                minutes: 30,
              },
            ],
            placeholder_instructor_id: isClassOnly ? "ph-1" : undefined,
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/api/scheduling/instructor-class-location-details") && init?.method === "POST") {
        return new Response(JSON.stringify({ rows: [{ id: "m2" }] }), { status: 201 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<ClassesTab />);

    const editButton = await screen.findByTitle("Edit");
    fireEvent.click(editButton);

    const durationsSection = await screen.findByTestId("class-durations-section");
    const addDuration = await within(durationsSection).findByRole("button", { name: /45 minutes/i });
    fireEvent.click(addDuration);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/scheduling/instructor-class-location-details",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

