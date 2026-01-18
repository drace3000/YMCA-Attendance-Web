import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InstructorsTab } from "@/app/maintenance/instructors-tab";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isAdmin: false }),
}));

describe("InstructorsTab row click edit", () => {
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

  it("opens Edit Instructor form when a table row is clicked", async () => {
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
              nickname: "JOHN",
              readable_id: "BR1-JOHN",
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

      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<InstructorsTab />);

    // Wait for row render
    await screen.findByText("John Doe");

    fireEvent.click(screen.getByText("John Doe"));

    await waitFor(() => {
      expect(screen.getByText("Edit Instructor")).toBeInTheDocument();
      expect(screen.getByDisplayValue("John")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Doe")).toBeInTheDocument();
      expect(screen.getByDisplayValue("JOHN")).toBeInTheDocument();
    });
  });
});

