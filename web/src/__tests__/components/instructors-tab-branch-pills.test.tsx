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

describe("InstructorsTab branch availability pills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseThemeSettings.mockReturnValue({
      branch: { id: "br-home", name: "Home Branch" },
    });

    // Radix Popover uses ResizeObserver; ensure it exists in this test environment.
    if (typeof globalThis.ResizeObserver === "undefined") {
      class ResizeObserverShim {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      // @ts-expect-error - attach to global for tests
      globalThis.ResizeObserver = ResizeObserverShim;
      // @ts-expect-error - attach to window for tests
      window.ResizeObserver = ResizeObserverShim;
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders branch pills and shows branch name in popover on hover", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/maintenance/organization") {
        return new Response(
          JSON.stringify({
            associations: [{ id: "as-1", code: "GROC", name: "YMCA of Greater Rochester", alliance_id: "al-1" }],
            branches: [
              {
                id: "br-home",
                code: "eastside",
                short_code: "ES",
                name: "Eastside Family YMCA",
                association_id: "as-1",
              },
              {
                id: "br-other",
                code: "bayview",
                short_code: "BV",
                name: "Bay View Family YMCA",
                association_id: "as-1",
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/api/maintenance/instructors?")) {
        return new Response(
          JSON.stringify([
            {
              id: "inst-1",
              branch_id: "br-home",
              raw_name: "Eva Langford",
              first_name: "Eva",
              last_name: "Langford",
              nickname: "EVA",
              readable_id: "GROC-ES-EVA",
              is_active: true,
              created_at: "2026-01-01T00:00:00Z",
              available_branches: [
                { branch_id: "br-home", is_primary: true },
                { branch_id: "br-other", is_primary: false },
              ],
            },
          ]),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<InstructorsTab />);

    await waitFor(() => {
      expect(screen.getByText("Eva Langford")).toBeInTheDocument();
    });

    // Pill label uses association code + branch code
    const pill = await screen.findByRole("button", { name: "GROC-ES" });
    expect(pill).toBeInTheDocument();

    // Hover to show popover with full branch name
    fireEvent.mouseEnter(pill);
    await waitFor(() => {
      expect(screen.getByText("Eastside Family YMCA")).toBeInTheDocument();
    });

    fireEvent.mouseLeave(pill);
  });
});


