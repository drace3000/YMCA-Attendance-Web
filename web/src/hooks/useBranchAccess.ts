"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-provider";

type RecipientAccessResponse = {
  recipient: {
    recipient_type: "Administrator" | "Branch";
    is_active: boolean;
    needs_password_setup: boolean;
    branch_id: string;
    association_id: string | null;
    alliance_id: string | null;
  };
};

export interface UserAccess {
  isAdmin: boolean;
  isBranch: boolean;
  allianceId: string | null;
  associationId: string | null;
  branchId: string | null;
  canAccessAlliance: (targetAllianceId: string) => boolean;
  canAccessAssociation: (targetAssociationId: string) => boolean;
  canAccessBranch: (targetBranchId: string) => boolean;
}

export function useBranchAccess(): UserAccess {
  const { user, loading, isDevMode, recipientContext, setRecipientContext } = useAuth();

  const shouldFetch =
    !isDevMode && !loading && !!user?.email;

  const { data } = useQuery({
    queryKey: ["auth", "recipient-access", user?.email ?? null],
    enabled: shouldFetch,
    queryFn: async () => {
      const res = await fetch("/api/auth/recipient-access");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json?.error === "string" ? json.error : "Failed to load access context";
        throw new Error(msg);
      }
      return json as RecipientAccessResponse;
    },
    retry: 0,
    staleTime: 1000 * 60 * 5,
  });

  // If server returns richer IDs, persist into auth context for the rest of the app.
  useEffect(() => {
    const next = data?.recipient;
    if (!next) return;

    // Only update when different to avoid loops.
    const changed =
      recipientContext.recipient_type !== next.recipient_type ||
      recipientContext.branch_id !== next.branch_id ||
      recipientContext.association_id !== (next.association_id ?? null) ||
      recipientContext.alliance_id !== (next.alliance_id ?? null);

    if (!changed) return;

    setRecipientContext({
      recipient_type: next.recipient_type,
      branch_id: next.branch_id,
      association_id: next.association_id ?? null,
      alliance_id: next.alliance_id ?? null,
    });
  }, [data, recipientContext, setRecipientContext]);

  const isAdmin = recipientContext.recipient_type === "Administrator";
  const isBranch = recipientContext.recipient_type === "Branch";

  const allianceId = recipientContext.alliance_id ?? null;
  const associationId = recipientContext.association_id ?? null;
  const branchId = recipientContext.branch_id ?? null;

  return useMemo(
    () => ({
      isAdmin,
      isBranch,
      allianceId,
      associationId,
      branchId,
      canAccessAlliance: (targetAllianceId: string) => {
        if (isAdmin) return true;
        return !!allianceId && allianceId === targetAllianceId;
      },
      canAccessAssociation: (targetAssociationId: string) => {
        if (isAdmin) return true;
        return !!associationId && associationId === targetAssociationId;
      },
      canAccessBranch: (targetBranchId: string) => {
        if (isAdmin) return true;
        return !!branchId && branchId === targetBranchId;
      },
    }),
    [isAdmin, isBranch, allianceId, associationId, branchId],
  );
}

