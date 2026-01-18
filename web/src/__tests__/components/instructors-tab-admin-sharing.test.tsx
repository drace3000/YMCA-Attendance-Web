import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InstructorsTab } from "@/app/maintenance/instructors-tab";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isAdmin: true }),
}));

describe("InstructorsTab admin sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseThemeSettings.mockReturnValue({
      branch: { id: "br-home", name: "Home Branch" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("allows admin to manage instructor shared branches and saves via the branches API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      // Organization branches list (admin-only UI)
      if (url === "/api/maintenance/organization") {
        return new Response(
          JSON.stringify({
            associations: [{ id: "as-1", code: "GROC", name: "YMCA of Greater Rochester", alliance_id: "al-1" }],
            branches: [
              {
                id: "br-home",
                code: "home",
                short_code: "H",
                name: "Home Branch",
                association_id: "as-1",
              },
              {
                id: "br-other",
                code: "other",
                short_code: "O",
                name: "Other Branch",
                association_id: "as-1",
              },
            ],
          }),
          { status: 200 },
        );
      }

      // Instructors list
      if (url.includes("/api/maintenance/instructors?")) {
        const params = url.split("?")[1] ?? "";
        if (params.includes("check_nickname=")) {
          return new Response(JSON.stringify({ exists: false, suggestions: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify([
            {
              id: "inst-1",
              branch_id: "br-home",
              raw_name: "Jane Doe",
              first_name: "Jane",
              last_name: "Doe",
              nickname: "JANE D",
              readable_id: "AS-H-JANED",
              is_active: true,
              created_at: "2026-01-01T00:00:00Z",
            },
          ]),
          { status: 200 },
        );
      }

      // Load current instructor branch links
      if (url === "/api/maintenance/instructors/inst-1/branches" && method === "GET") {
        return new Response(
          JSON.stringify([{ branch_id: "br-home", is_primary: true }]),
          { status: 200 },
        );
      }

      // Save instructor (PUT)
      if (url === "/api/maintenance/instructors" && method === "PUT") {
        return new Response(
          JSON.stringify({
            id: "inst-1",
            branch_id: "br-home",
            first_name: "Jane",
            last_name: "Doe",
            nickname: "JANE D",
            readable_id: "AS-H-JANED",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
            raw_name: "Jane Doe",
          }),
          { status: 200 },
        );
      }

      // Save instructor sharing (PUT)
      if (url === "/api/maintenance/instructors/inst-1/branches" && method === "PUT") {
        return new Response(
          JSON.stringify([
            { branch_id: "br-home", is_primary: true },
            { branch_id: "br-other", is_primary: false },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ error: `Unhandled ${method} ${url}` }), { status: 500 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<InstructorsTab />);

    // Ensure instructor row renders
    await waitFor(() => {
      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    });

    // Open edit form
    fireEvent.click(screen.getByTitle("Edit"));

    await waitFor(() => {
      expect(screen.getByText("Edit Instructor")).toBeInTheDocument();
      expect(screen.getByText("Available in branches")).toBeInTheDocument();
    });

    // Open branch selector popover and select another branch
    fireEvent.click(screen.getByRole("button", { name: /manage/i }));
    await waitFor(() => {
      expect(screen.getByText(/select branches/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("O - Other Branch"));

    // Save should call both instructor PUT and branches PUT
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/maintenance/instructors/inst-1/branches",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });
});

