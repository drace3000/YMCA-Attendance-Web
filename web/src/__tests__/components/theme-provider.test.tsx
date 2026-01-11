import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

import { ThemeSettingsProvider, useThemeSettings } from "@/components/theme-settings-provider";

const ASSIGNED_BRANCH_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_BRANCH_ID = "22222222-2222-2222-2222-222222222222";

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({
    isBranch: true,
    branchId: ASSIGNED_BRANCH_ID,
  }),
}));

function Probe() {
  const { branch, setBranch } = useThemeSettings();
  return (
    <div>
      <div data-testid="branch-id">{branch.id}</div>
      <button
        type="button"
        onClick={() => setBranch({ id: OTHER_BRANCH_ID, name: "Other Branch" })}
      >
        Switch branch
      </button>
    </div>
  );
}

describe("Phase 8 - ThemeSettingsProvider (Branch user branch lock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide a predictable localStorage implementation for this test file.
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
    });
    try {
      window.localStorage.removeItem("ymca-theme");
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    try {
      window.localStorage.removeItem("ymca-theme");
    } catch {
      // ignore
    }
  });

  it("forces stored branch to the assigned branch for Branch users", async () => {
    window.localStorage.setItem(
      "ymca-theme",
      JSON.stringify({
        brandColor: "#01A490",
        mode: "light",
        sidebarPosition: "left",
        branch: { id: OTHER_BRANCH_ID, name: "Other Branch" },
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith(`/api/branches/${ASSIGNED_BRANCH_ID}`)) {
          return {
            ok: true,
            json: async () => ({ id: ASSIGNED_BRANCH_ID, name: "Assigned Branch" }),
          };
        }
        return { ok: false, json: async () => ({ error: "not found" }) };
      }) as any,
    );

    render(
      <ThemeSettingsProvider>
        <Probe />
      </ThemeSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("branch-id").textContent).toBe(ASSIGNED_BRANCH_ID);
    });
  });

  it("prevents setBranch from switching away from assigned branch for Normal users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: ASSIGNED_BRANCH_ID, name: "Assigned Branch" }),
      })) as any,
    );

    render(
      <ThemeSettingsProvider>
        <Probe />
      </ThemeSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("branch-id").textContent).toBe(ASSIGNED_BRANCH_ID);
    });

    fireEvent.click(screen.getByRole("button", { name: /switch branch/i }));
    expect(screen.getByTestId("branch-id").textContent).toBe(ASSIGNED_BRANCH_ID);
  });
});

