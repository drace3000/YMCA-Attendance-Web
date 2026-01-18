import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { InstructorAvailabilityModal } from "@/components/instructor-availability/InstructorAvailabilityModal";

describe("InstructorAvailabilityModal - Save/Cancel + time gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("disables time pickers until a day is selected, and filters end times to be > start time", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/branches/") || url.includes("/api/branches/")) {
        return new Response(
          JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }),
          { status: 200 },
        );
      }
      if (url.includes("/api/scheduling/instructor-availability") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify({ availability: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <InstructorAvailabilityModal
        isOpen
        onClose={() => {}}
        branchId="br-1"
        instructorId="i-1"
        instructorLabel="Instructor"
        initialMonth="2026-02"
      />,
    );

    const startBtn = await screen.findByRole("button", { name: /start time/i });
    const endBtn = screen.getByRole("button", { name: /end time/i });

    expect(startBtn).toBeDisabled();
    expect(endBtn).toBeDisabled();

    // Select a day
    fireEvent.click(screen.getByRole("button", { name: "MON" }));
    expect(startBtn).not.toBeDisabled();
    expect(endBtn).not.toBeDisabled();

    // Range-limited options (06:00..23:00)
    fireEvent.click(endBtn);
    expect(screen.queryByRole("button", { name: "05:45 AM" })).not.toBeInTheDocument();
    // End is constrained by the current Start selection (+15min)
    expect(screen.queryByRole("button", { name: "08:00 AM" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "08:15 AM" })).toBeInTheDocument();

    // Pick End first, then ensure Start options are strictly less than End
    fireEvent.click(screen.getByRole("button", { name: "10:00 PM" }));

    fireEvent.click(startBtn);
    expect(screen.queryByRole("button", { name: "10:00 PM" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "09:45 PM" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "09:45 PM" }));

    // Now ensure End options are strictly greater than Start
    fireEvent.click(endBtn);
    expect(screen.queryByRole("button", { name: "09:45 PM" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "10:00 PM" })).toBeInTheDocument();
  }, 15000);

  it("does not prompt to discard on X/Cancel when there are no changes, and Save stays disabled", async () => {
    const onClose = vi.fn();
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock as any);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(
          JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }),
          { status: 200 },
        );
      }
      if (url.includes("/api/scheduling/instructor-availability") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify({ availability: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <InstructorAvailabilityModal
        isOpen
        onClose={onClose}
        branchId="br-1"
        instructorId="i-1"
        instructorLabel="Instructor"
        initialMonth="2026-02"
      />,
    );

    // Save is disabled when no changes
    const saveBtn = await screen.findByRole("button", { name: /^save$/i });
    expect(saveBtn).toBeDisabled();

    // Cancel should close without confirm
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it("shows existing availability windows for the selected month after load", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(
          JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }),
          { status: 200 },
        );
      }
      if (url.includes("/api/scheduling/instructor-availability") && (!init || !init.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            availability: [
              {
                id: "row-1",
                branch_id: "br-1",
                instructor_id: "i-1",
                schedule_month: "2026-01",
                day_of_week: "MONDAY",
                available_start: "08:00",
                available_end: "09:00",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <InstructorAvailabilityModal
        isOpen
        onClose={() => {}}
        branchId="br-1"
        instructorId="i-1"
        instructorLabel="Instructor"
        initialMonth="2026-01"
      />,
    );

    // Wait for the existing row to appear in Current windows.
    await waitFor(() => {
      expect(screen.getByText("MONDAY")).toBeInTheDocument();
      expect(screen.getByText("08:00–09:00")).toBeInTheDocument();
    });

    // Save should remain disabled (no changes yet)
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("stages changes and Cancel does not persist (no POST/DELETE)", async () => {
    const onClose = vi.fn();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(
          JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }),
          { status: 200 },
        );
      }
      if (url.includes("/api/scheduling/instructor-availability") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify({ availability: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <InstructorAvailabilityModal
        isOpen
        onClose={onClose}
        branchId="br-1"
        instructorId="i-1"
        instructorLabel="Instructor"
        initialMonth="2026-02"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "MON" }));

    // Pick start/end and stage add
    fireEvent.click(screen.getByRole("button", { name: /start time/i }));
    fireEvent.click(await screen.findByText("06:00 AM"));

    fireEvent.click(screen.getByRole("button", { name: /end time/i }));
    fireEvent.click(await screen.findByText("06:15 AM"));

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    // Should close without persisting
    expect(onClose).toHaveBeenCalledOnce();

    const writes = fetchMock.mock.calls.filter((c) => {
      const url = String(c[0]);
      const init = c[1] as RequestInit | undefined;
      return url.includes("/api/scheduling/instructor-availability") && (init?.method === "POST" || init?.method === "DELETE");
    });
    expect(writes.length).toBe(0);
  });

  it("Save persists staged changes (POST called) and closes", async () => {
    const onClose = vi.fn();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(
          JSON.stringify({ availability_time_start: "06:00", availability_time_end: "23:00" }),
          { status: 200 },
        );
      }
      if (url.includes("/api/scheduling/instructor-availability") && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify({ availability: [] }), { status: 200 });
      }
      if (url.includes("/api/scheduling/instructor-availability") && init?.method === "POST") {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <InstructorAvailabilityModal
        isOpen
        onClose={onClose}
        branchId="br-1"
        instructorId="i-1"
        instructorLabel="Instructor"
        initialMonth="2026-02"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "MON" }));

    fireEvent.click(screen.getByRole("button", { name: /start time/i }));
    fireEvent.click(await screen.findByText("06:00 AM"));

    fireEvent.click(screen.getByRole("button", { name: /end time/i }));
    fireEvent.click(await screen.findByText("06:15 AM"));

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });

    const posts = fetchMock.mock.calls.filter((c) => {
      const url = String(c[0]);
      const init = c[1] as RequestInit | undefined;
      return url.includes("/api/scheduling/instructor-availability") && init?.method === "POST";
    });
    expect(posts.length).toBe(1);
  });
});


