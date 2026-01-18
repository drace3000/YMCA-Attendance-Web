import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

import { InstructorsTab } from "@/app/maintenance/instructors-tab";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isAdmin: false }),
}));

describe("InstructorsTab branch scoping", () => {
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

  it("includes branch_id when loading instructors", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/maintenance/instructors?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<InstructorsTab />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/maintenance/instructors?"),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("branch_id=br-1"),
      );
    });
  });
});


