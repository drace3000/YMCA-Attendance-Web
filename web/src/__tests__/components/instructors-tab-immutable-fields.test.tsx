import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { InstructorsTab } from "@/app/maintenance/instructors-tab";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isAdmin: false }),
}));

describe("InstructorsTab immutable nickname + Instructor ID on edit", () => {
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

  it("disables nickname input and shows Instructor ID on edit", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/maintenance/instructors?")) {
        return new Response(
          JSON.stringify([
            {
              id: "inst-1",
              branch_id: "br-1",
              raw_name: null,
              first_name: "John",
              last_name: "Doe",
              nickname: "JOHNDOE",
              readable_id: "GROC-ES-JOHNDOE",
              is_active: true,
              created_at: new Date().toISOString(),
              available_branches: [],
            },
          ]),
          { status: 200 },
        );
      }

      if (url.includes("/api/scheduling/instructor-availability?")) {
        return new Response(JSON.stringify({ availability: [] }), { status: 200 });
      }

      if (url.includes("/api/branches/")) {
        return new Response(JSON.stringify({ short_code: "ES", association_code: "GROC" }), { status: 200 });
      }

      // Nickname validation calls should not break edit flow
      if (url.includes("check_nickname=")) {
        return new Response(JSON.stringify({ exists: false, suggestions: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<InstructorsTab />);

    await screen.findByText("John Doe");

    // Open edit form via row edit action
    fireEvent.click(screen.getByTitle("Edit"));
    await screen.findByText("Edit Instructor");

    const nicknameInput = screen.getByDisplayValue("JOHNDOE") as HTMLInputElement;
    expect(nicknameInput).toBeDisabled();

    await waitFor(() => {
      const label = screen.getByText(/Instructor ID:/i);
      expect(label).toBeInTheDocument();
      expect(within(label.parentElement as HTMLElement).getByText("GROC-ES-JOHNDOE")).toBeInTheDocument();
    });
  });
});

