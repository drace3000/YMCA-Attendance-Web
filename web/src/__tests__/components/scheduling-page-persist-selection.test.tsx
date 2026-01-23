import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import SchedulingPage from "@/app/scheduling/page";
import {
  getPersistedScheduleSelectionStorageKey,
  serializePersistedScheduleSelection,
} from "@/lib/persisted-schedule-selection";

type FetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<any>;
};

function mockJson(ok: boolean, data: any, status = 200): FetchResponse {
  return {
    ok,
    status,
    json: async () => data,
  };
}

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    branch: { id: "br-1", name: "Branch 1" },
  }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
  }),
}));

vi.mock("@/lib/error-logger", () => ({
  logError: vi.fn(async () => "E_TEST"),
}));

describe("SchedulingPage persisted schedule selection", () => {
  const makeLocalStorage = (): Storage => {
    const store = new Map<string, string>();
    const api = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };
    return api as unknown as Storage;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "localStorage", {
        value: makeLocalStorage(),
        configurable: true,
      });
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("restores selected schedule from localStorage across remount, and write-through persists on manual change", async () => {
    const storageKey = getPersistedScheduleSelectionStorageKey({ userId: "user-1", branchId: "br-1" });
    expect(storageKey).toBeTruthy();

    window.localStorage.setItem(
      storageKey!,
      serializePersistedScheduleSelection({
        program_group_id: "pg-1",
        schedule_id: "sch-2",
        month_start: "2025-11-01",
      }),
    );

    let uiStatePosts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [
            { id: "sch-1", name: "October 2025", month_start: "2025-10-01", status: "draft" },
            { id: "sch-2", name: "November 2025", month_start: "2025-11-01", status: "draft" },
          ],
        });
      }
      if (url.endsWith("/api/branches/br-1")) {
        return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });
      }

      // SessionsTab child requests (minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return mockJson(true, { requestedYear: 2025, requestedYearMissing: false });
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      if (url.includes("/api/scheduling/ui-state") && init?.method === "POST") {
        uiStatePosts += 1;
        return mockJson(true, { ok: true });
      }

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    const { unmount } = render(<SchedulingPage />);

    // Schedule trigger should reflect restored schedule name.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /November 2025/i })).toBeInTheDocument();
    });

    // Unmount/remount should restore again.
    unmount();
    render(<SchedulingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /November 2025/i })).toBeInTheDocument();
    });

    // Manual change should update localStorage and POST to server.
    fireEvent.click(screen.getByRole("button", { name: /November 2025/i }));
    fireEvent.click(await screen.findByRole("button", { name: /October 2025/i }));

    await waitFor(() => {
      expect(uiStatePosts).toBe(1);
      expect(screen.getByRole("button", { name: /October 2025/i })).toBeInTheDocument();
    });

    const storedRaw = window.localStorage.getItem(storageKey!);
    expect(storedRaw).toBeTruthy();
    expect(storedRaw).toContain("\"schedule_id\":\"sch-1\"");
  }, 20000);

  it("falls back to server ui-state when localStorage is missing (and seeds localStorage)", async () => {
    const storageKey = getPersistedScheduleSelectionStorageKey({ userId: "user-1", branchId: "br-1" });
    expect(storageKey).toBeTruthy();

    let uiStateGets = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [
            { id: "sch-1", name: "October 2025", month_start: "2025-10-01", status: "draft" },
            { id: "sch-2", name: "November 2025", month_start: "2025-11-01", status: "draft" },
          ],
        });
      }
      if (url.endsWith("/api/branches/br-1")) {
        return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });
      }

      // Server fallback restore
      if (url.includes("/api/scheduling/ui-state?") && (!init || !init.method || init.method === "GET")) {
        uiStateGets += 1;
        return mockJson(true, {
          selectedSchedule: { program_group_id: "pg-1", schedule_id: "sch-2", month_start: "2025-11-01" },
        });
      }

      // SessionsTab child requests (minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return mockJson(true, { requestedYear: 2025, requestedYearMissing: false });
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /November 2025/i })).toBeInTheDocument();
      expect(uiStateGets).toBe(1);
    });

    // Server selection should be written to localStorage for next time.
    const raw = window.localStorage.getItem(storageKey!);
    expect(raw).toBeTruthy();
    expect(raw).toContain("\"schedule_id\":\"sch-2\"");
  }, 20000);

  it("falls back by month_start when stored schedule_id is missing, and persists the corrected schedule_id", async () => {
    const storageKey = getPersistedScheduleSelectionStorageKey({ userId: "user-1", branchId: "br-1" });
    expect(storageKey).toBeTruthy();

    // schedule_id is missing, but month_start matches sch-2
    window.localStorage.setItem(
      storageKey!,
      serializePersistedScheduleSelection({
        program_group_id: "pg-1",
        schedule_id: "sch-missing",
        month_start: "2025-11-01",
      }),
    );

    let uiStatePosts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [
            { id: "sch-1", name: "October 2025", month_start: "2025-10-01", status: "draft" },
            { id: "sch-2", name: "November 2025", month_start: "2025-11-01", status: "draft" },
          ],
        });
      }
      if (url.endsWith("/api/branches/br-1")) {
        return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });
      }

      // SessionsTab child requests (minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return mockJson(true, { requestedYear: 2025, requestedYearMissing: false });
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      if (url.includes("/api/scheduling/ui-state") && init?.method === "POST") {
        uiStatePosts += 1;
        return mockJson(true, { ok: true });
      }

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /November 2025/i })).toBeInTheDocument();
      expect(uiStatePosts).toBe(1);
    });

    const raw = window.localStorage.getItem(storageKey!);
    expect(raw).toBeTruthy();
    expect(raw).toContain("\"schedule_id\":\"sch-2\"");
  }, 20000);

  it("defaults to first schedule and writes through when neither localStorage nor server has a selection", async () => {
    const storageKey = getPersistedScheduleSelectionStorageKey({ userId: "user-1", branchId: "br-1" });
    expect(storageKey).toBeTruthy();

    let uiStateGets = 0;
    let uiStatePosts = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/api/branches/br-1/program-groups")) {
        return mockJson(true, {
          groups: [{ id: "pg-1", code: "GroupX", name: "Group X", description: "", sort_order: 1, is_enabled: true }],
        });
      }
      if (url.includes("/api/scheduling/schedules")) {
        return mockJson(true, {
          schedules: [
            { id: "sch-1", name: "October 2025", month_start: "2025-10-01", status: "draft" },
            { id: "sch-2", name: "November 2025", month_start: "2025-11-01", status: "draft" },
          ],
        });
      }
      if (url.endsWith("/api/branches/br-1")) {
        return mockJson(true, { alliance_name: "Alliance", association_name: "Association" });
      }

      if (url.includes("/api/scheduling/ui-state?") && (!init || !init.method || init.method === "GET")) {
        uiStateGets += 1;
        return mockJson(true, { selectedSchedule: null });
      }
      if (url.includes("/api/scheduling/ui-state") && init?.method === "POST") {
        uiStatePosts += 1;
        return mockJson(true, { ok: true });
      }

      // SessionsTab child requests (minimal)
      if (url.includes("/api/maintenance/classes")) return mockJson(true, []);
      if (url.includes("/api/maintenance/locations")) return mockJson(true, []);
      if (url.includes("/api/maintenance/instructors")) return mockJson(true, []);
      if (url.includes("/api/scheduling/sessions")) return mockJson(true, { sessions: [] });
      if (url.includes("/api/scheduling/instructor-availability")) return mockJson(true, { availability: [] });
      if (url.includes("/api/maintenance/holidays/import-us?")) {
        return mockJson(true, { requestedYear: 2025, requestedYearMissing: false });
      }
      if (url.includes("/api/maintenance/holidays")) return mockJson(true, []);

      return mockJson(true, {});
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(<SchedulingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /October 2025/i })).toBeInTheDocument();
      expect(uiStateGets).toBe(1);
      expect(uiStatePosts).toBe(1);
    });

    const raw = window.localStorage.getItem(storageKey!);
    expect(raw).toBeTruthy();
    expect(raw).toContain("\"schedule_id\":\"sch-1\"");
  }, 20000);
});

