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

describe("InstructorsTab gated controls while form open", () => {
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

  it("disables Add/Search/Filter and disables table interactions while the form is open", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/maintenance/instructors?")) {
        // Nickname check validation calls include check_nickname param; return safe default.
        if (url.includes("check_nickname=")) {
          return new Response(JSON.stringify({ exists: false, suggestions: [] }), { status: 200 });
        }
        if (url.includes("suggest_nicknames=true")) {
          return new Response(JSON.stringify({ suggestions: ["JOHNDOE", "JOHNDE", "JOHND", "JD", "JOHNDOEA"] }), {
            status: 200,
          });
        }
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

      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<InstructorsTab />);

    // Ensure list loads and row is visible
    await screen.findByText("John Doe");

    // Open New Instructor form
    fireEvent.click(screen.getByRole("button", { name: /add instructor/i }));
    await screen.findByText("New Instructor");

    // Controls should be disabled
    expect(screen.getByRole("button", { name: /add instructor/i })).toBeDisabled();
    expect(screen.getByPlaceholderText("Search...")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Narrow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Find" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Smart" })).toBeDisabled();

    // Table should be visually disabled and non-interactive
    const tableContainer = screen.getByTestId("instructors-table-container");
    expect(tableContainer).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("instructors-table-disabled-overlay")).toBeInTheDocument();

    // Attempting to click the row text should not switch the form to Edit (still New)
    fireEvent.click(screen.getByText("John Doe"));
    await waitFor(() => {
      expect(screen.getByText("New Instructor")).toBeInTheDocument();
      expect(screen.queryByText("Edit Instructor")).not.toBeInTheDocument();
    });

    // Close form via Cancel -> everything re-enabled
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByText("New Instructor")).not.toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /add instructor/i })).not.toBeDisabled();
    expect(screen.getByPlaceholderText("Search...")).not.toBeDisabled();
    expect(screen.queryByTestId("instructors-table-disabled-overlay")).not.toBeInTheDocument();
  });
});

