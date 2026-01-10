import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type MockAuthState = {
  user: { email?: string | null } | null;
  loading: boolean;
  isDevMode: boolean;
  recipientContext: {
    recipient_type: "Administrator" | "Normal" | null;
    branch_id: string | null;
    association_id: string | null;
    alliance_id: string | null;
  };
  setRecipientContext: (ctx: MockAuthState["recipientContext"]) => void;
};

let mockAuth: MockAuthState;

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

import { useBranchAccess } from "@/hooks/useBranchAccess";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("Phase 7 - useBranchAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth = {
      user: null,
      loading: false,
      isDevMode: false,
      recipientContext: {
        recipient_type: null,
        branch_id: null,
        association_id: null,
        alliance_id: null,
      },
      setRecipientContext: vi.fn(),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns safe defaults when unauthenticated", () => {
    const { result } = renderHook(() => useBranchAccess(), { wrapper: createWrapper() });
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isNormal).toBe(false);
    expect(result.current.branchId).toBeNull();
    expect(result.current.associationId).toBeNull();
    expect(result.current.allianceId).toBeNull();
  });

  it("allows Admin access to any target ids", () => {
    mockAuth = {
      ...mockAuth,
      isDevMode: true, // dev mode skips fetch; uses recipientContext only
      recipientContext: {
        recipient_type: "Administrator",
        branch_id: "br-1",
        association_id: "assoc-1",
        alliance_id: "all-1",
      },
    };

    const { result } = renderHook(() => useBranchAccess(), { wrapper: createWrapper() });
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.canAccessAlliance("x")).toBe(true);
    expect(result.current.canAccessAssociation("y")).toBe(true);
    expect(result.current.canAccessBranch("z")).toBe(true);
  });

  it("restricts Normal access to its chain ids", () => {
    mockAuth = {
      ...mockAuth,
      isDevMode: true,
      recipientContext: {
        recipient_type: "Normal",
        branch_id: "br-1",
        association_id: "assoc-1",
        alliance_id: "all-1",
      },
    };

    const { result } = renderHook(() => useBranchAccess(), { wrapper: createWrapper() });
    expect(result.current.isNormal).toBe(true);
    expect(result.current.canAccessBranch("br-1")).toBe(true);
    expect(result.current.canAccessBranch("br-2")).toBe(false);
    expect(result.current.canAccessAssociation("assoc-1")).toBe(true);
    expect(result.current.canAccessAssociation("assoc-2")).toBe(false);
    expect(result.current.canAccessAlliance("all-1")).toBe(true);
    expect(result.current.canAccessAlliance("all-2")).toBe(false);
  });

  it("hydrates recipientContext from /api/auth/recipient-access when authenticated", async () => {
    mockAuth = {
      ...mockAuth,
      user: { email: "manager@ymca.org" },
      isDevMode: false,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          recipient: {
            recipient_type: "Normal",
            is_active: true,
            needs_password_setup: false,
            branch_id: "br-1",
            association_id: "assoc-1",
            alliance_id: "all-1",
          },
        }),
      })) as any,
    );

    renderHook(() => useBranchAccess(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockAuth.setRecipientContext).toHaveBeenCalledWith({
        recipient_type: "Normal",
        branch_id: "br-1",
        association_id: "assoc-1",
        alliance_id: "all-1",
      });
    });
  });
});

