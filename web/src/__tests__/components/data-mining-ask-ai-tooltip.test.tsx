import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import DataMiningPage from "@/app/data-mining/page";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

describe("Natural Language Queries - Ask AI tooltip", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Radix Popover uses ResizeObserver; ensure it exists in this test environment.
    if (typeof globalThis.ResizeObserver === "undefined") {
      class ResizeObserverShim {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      // @ts-expect-error - attach to global for tests
      globalThis.ResizeObserver = ResizeObserverShim;
      if (typeof window !== "undefined") {
        // @ts-expect-error - attach to window for tests
        window.ResizeObserver = ResizeObserverShim;
      }
    }

    mockUseThemeSettings.mockReturnValue({
      branch: { id: "br-1", name: "Eastside Family YMCA" },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1")) {
        return new Response(
          JSON.stringify({
            id: "br-1",
            name: "Eastside Family YMCA",
            alliance_name: "alliance of new york state ymcas",
            association_name: "ymca of greater rochester",
          }),
          { status: 200 },
        );
      }

      if (url.includes("/api/saved-queries?")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows popover on hover: "Restricted to {Branch} data only"', async () => {
    render(<DataMiningPage />);

    // Enable the Ask AI button by entering a query (button is disabled when textarea is empty).
    const textarea = await screen.findByPlaceholderText(
      /which instructors teach which classes and what locations are classes being held/i,
    );
    fireEvent.change(textarea, { target: { value: "test question" } });

    const askAiButton = await screen.findByRole("button", { name: /ask ai/i });
    fireEvent.mouseEnter(askAiButton);

    expect(
      await screen.findByText(/Restricted to Eastside Family YMCA data only/i),
    ).toBeInTheDocument();
  });
});


