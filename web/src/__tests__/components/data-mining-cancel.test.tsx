import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import DataMiningPage from "@/app/data-mining/page";

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

describe("Natural Language Queries - Cancel in-flight request", () => {
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Cancel while loading and aborts the request when clicked", async () => {
    let aborted = false;

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "br-1",
              name: "Eastside Family YMCA",
              alliance_name: "alliance of new york state ymcas",
              association_name: "ymca of greater rochester",
            }),
            { status: 200 },
          ),
        );
      }

      if (url.includes("/api/saved-queries?")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }

      if (url.includes("/api/data-mining")) {
        const signal = init?.signal;
        return new Promise((_resolve, reject) => {
          if (signal) {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new DOMException("Aborted", "AbortError"));
            });
          }
        }) as any;
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<DataMiningPage />);

    const textarea = await screen.findByPlaceholderText(
      /which instructors teach which classes and what locations are classes being held/i,
    );
    fireEvent.change(textarea, { target: { value: "test question" } });

    const askAiButton = await screen.findByRole("button", { name: /ask ai/i });
    expect(askAiButton).toBeEnabled();

    fireEvent.click(askAiButton);

    // Loading state: Cancel appears
    expect(await screen.findByRole("button", { name: /cancel/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => {
      expect(aborted).toBe(true);
    });

    // UI returns to non-loading state; Ask AI is enabled again (query remains)
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /ask ai/i })).toBeEnabled();
    });
  });
});


