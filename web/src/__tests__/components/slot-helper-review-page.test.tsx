import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import SlotHelperReviewClient from "@/app/scheduling/slot-helper-review/SlotHelperReviewClient";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("t=tok-1"),
}));

type FetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<any>;
};

function mockJson(ok: boolean, data: any, status = 200): FetchResponse {
  return { ok, status, json: async () => data };
}

describe("SlotHelperReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads request, defaults all slots selected, and submits", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/scheduling/slot-helper-review/request")) {
        return mockJson(true, {
          expired: false,
          request: {
            id: "req-1",
            created_at: "2026-01-15T00:00:00Z",
            expires_at: "2099-01-17T00:00:00Z",
            responded_at: null,
            response_selected_hold_ids: [],
            response_comment: null,
          },
          holds: [
            {
              id: "hold-1",
              slot_date: "2026-01-01",
              start_time: "06:00",
              end_time: "07:00",
              released_at: null,
              consumed_at: null,
            },
            {
              id: "hold-2",
              slot_date: "2026-01-01",
              start_time: "07:00",
              end_time: "08:00",
              released_at: null,
              consumed_at: null,
            },
          ],
          context: { branch_id: "br-1", schedule_id: "sch-1", branch_name: "Eastside Family YMCA", schedule_name: "January 2026" },
        });
      }
      if (url.includes("/api/scheduling/slot-helper-review/submit") && init?.method === "POST") {
        return mockJson(true, { success: true });
      }
      return mockJson(false, { error: "Unexpected fetch" }, 500);
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SlotHelperReviewClient />);

    expect(await screen.findByText("Slot Review")).toBeInTheDocument();
    expect(await screen.findByText(/Eastside Family YMCA/i)).toBeInTheDocument();
    expect(await screen.findByText(/January 2026/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Selected:\s*2\/2/i)).toBeInTheDocument();
    });

    // Toggle one off
    fireEvent.click(screen.getByRole("button", { name: /Select slot hold-1/i }));
    await waitFor(() => {
      expect(screen.getByText(/Selected:\s*1\/2/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/Add any notes/i), { target: { value: "Please avoid 7am." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit response/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/scheduling/slot-helper-review/submit",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

