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
  useSearchParams: () => new URLSearchParams("email=user%40ymca.org&mode=otp"),
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
    user: null,
    signOut: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/hooks/useBranchAccess", () => ({
  useBranchAccess: () => ({ isAdmin: false, isBranch: false }),
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

describe("Shell OTP deep link bypass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not redirect unauthenticated OTP deep links to /splash", async () => {
    render(
      <Shell>
        <div data-testid="child">Child</div>
      </Shell>,
    );

    // The child should render (Shell doesn't redirect for OTP deep links)
    expect(screen.getByTestId("child")).toBeInTheDocument();

    // Give the useEffect a chance to run
    await new Promise((r) => setTimeout(r, 50));

    // router.replace should NOT have been called to redirect to /splash
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
