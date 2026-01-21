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

describe("InstructorsTab nickname suggestions + ID preview", () => {
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

  it("loads 5 suggested nicknames and shows Instructor ID preview for new instructor", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && url.includes("/api/branches/br-1")) {
        return new Response(JSON.stringify({ short_code: "ES", association_code: "GROC" }), { status: 200 });
      }

      if (method === "GET" && url.includes("/api/maintenance/instructors?")) {
        if (url.includes("suggest_nicknames=true")) {
          return new Response(JSON.stringify({ suggestions: ["JOHNDOE", "JOHNDE", "JOHND", "JDOE", "JOHNDOEA"] }), {
            status: 200,
          });
        }
        if (url.includes("check_nickname=")) {
          return new Response(JSON.stringify({ exists: false, suggestions: [] }), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      }

      if (method === "GET" && url.includes("/api/scheduling/instructor-availability?")) {
        return new Response(JSON.stringify({ availability: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: `Unhandled ${method} ${url}` }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(<InstructorsTab />);

    // Open New Instructor form
    fireEvent.click(await screen.findByRole("button", { name: /add instructor/i }));
    await screen.findByText("New Instructor");

    // Enter first + last name (triggers suggest_nicknames)
    fireEvent.change(screen.getByPlaceholderText("John"), { target: { value: "John" } });
    fireEvent.change(screen.getByPlaceholderText("Smith"), { target: { value: "Doe" } });

    // Wait for suggestion count indicator
    await waitFor(() => {
      expect(screen.getByText(/5 suggestions/i)).toBeInTheDocument();
    });

    // Nickname should auto-fill to first suggestion (letters-only, max 8)
    const nicknameInput = screen.getByPlaceholderText("JOHNS") as HTMLInputElement;
    await waitFor(() => {
      expect(nicknameInput.value).toBe("JOHNDOE");
    });

    // Instructor ID preview should render with assoc + branch short + nickname
    await waitFor(() => {
      expect(screen.getByText(/Instructor ID:/i)).toBeInTheDocument();
      expect(screen.getByText("GROC-ES-JOHNDOE")).toBeInTheDocument();
    });
  });
});

