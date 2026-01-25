import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { Shell } from "@/components/shell";

vi.mock("next/image", () => ({
  default: (props: any) => {
    // Minimal Next/Image stand-in for tests
    // eslint-disable-next-line jsx-a11y/alt-text
    const { priority: _priority, fill: _fill, ...rest } = props;
    return <img {...rest} />;
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/maintenance",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const mockUseThemeSettings = vi.fn();
vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => mockUseThemeSettings(),
}));

const mockUseAuth = vi.fn();
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isAdmin: true, isBranch: false }),
}));

vi.mock("@/hooks/useAdminHierarchySelection", () => ({
  useAdminHierarchySelection: () => ({
    hasSelection: false,
    isComplete: true,
    selection: {
      allianceId: null,
      allianceName: null,
      associationId: null,
      associationName: null,
      branchId: null,
      branchName: null,
    },
  }),
}));

describe("Shell global header hierarchy", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseThemeSettings.mockReturnValue({
      sidebarPosition: "left",
      toggleMode: vi.fn(),
      mode: "light",
      branch: { id: "br-1", name: "eastside family ymca" },
      setSidebarPosition: vi.fn(),
    });

    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      signOut: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders Alliance -> Association -> Branch (names only, proper case)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/branches/br-1")) {
        return new Response(
          JSON.stringify({
            id: "br-1",
            name: "eastside family ymca",
            alliance_name: "alliance of new york state ymcas",
            association_name: "ymca of greater rochester",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock as any);

    render(
      <Shell>
        <div>Child</div>
      </Shell>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "Alliance of New York State YMCAs -> YMCA of Greater Rochester -> Eastside Family YMCA",
        ),
      ).toBeInTheDocument();
    });
  });
});

