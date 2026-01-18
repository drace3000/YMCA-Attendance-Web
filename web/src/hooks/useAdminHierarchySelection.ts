"use client";

import { useSyncExternalStore } from "react";
import {
  getAdminHierarchySelection,
  isAdminHierarchyComplete,
  subscribeAdminHierarchySelection,
  type AdminHierarchySelection,
} from "@/lib/admin-hierarchy-selection";

export function useAdminHierarchySelection(): {
  hasSelection: boolean;
  selection: AdminHierarchySelection;
  isComplete: boolean;
} {
  const snapshot = useSyncExternalStore(
    subscribeAdminHierarchySelection,
    getAdminHierarchySelection,
    getAdminHierarchySelection,
  );

  return {
    hasSelection: snapshot.hasSelection,
    selection: snapshot.selection,
    isComplete: isAdminHierarchyComplete(snapshot.selection),
  };
}

