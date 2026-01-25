import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Shell } from "@/components/shell";

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/image", () => ({
  default: (props: any) => {
    const { priority: _priority, fill: _fill, ...rest } = props;
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/theme-settings-provider", () => ({
  useThemeSettings: () => ({
    sidebarPosition: "left",
    toggleMode: vi.fn(),
    mode: "light",
    branch: { id: "br-1", name: "Eastside Family YMCA" },
    setSidebarPosition: vi.fn(),
  }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    signOut: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isAdmin: true, isBranch: false }),
}));

vi.mock("@/hooks/useAdminHierarchySelection", () => ({
  useAdminHierarchySelection: () => ({
    hasSelection: true,
    isComplete: false,
    selection: {
      allianceId: "a-1",
      allianceName: "Alliance of New York State YMCAs",
      associationId: "assoc-1",
      associationName: "YMCA of Greater Rochester",
      branchId: null,
      branchName: null,
    },
  }),
}));

describe("Shell welcome landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as any,
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not auto-redirect admins to /maintenance when selection is incomplete", async () => {
    render(
      <Shell>
        <div data-testid="child">Child</div>
      </Shell>,
    );

    // The child should render (Shell renders on Welcome page)
    expect(screen.getByTestId("child")).toBeInTheDocument();

    // Give the useEffect a chance to run
    await new Promise((r) => setTimeout(r, 50));

    // router.push should NOT have been called to redirect to /maintenance
    expect(mockPush).not.toHaveBeenCalled();
  });
});
