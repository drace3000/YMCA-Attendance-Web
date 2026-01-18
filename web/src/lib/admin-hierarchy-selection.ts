export type AdminHierarchySelection = {
  allianceId: string | null;
  allianceName: string | null;
  associationId: string | null;
  associationName: string | null;
  branchId: string | null;
  branchName: string | null;
};

const STORAGE_KEY = "ymca-admin-hierarchy-selection";
const EVENT_NAME = "ymca-admin-hierarchy-selection-changed";

type AdminHierarchySnapshot = { hasSelection: boolean; selection: AdminHierarchySelection };

const EMPTY_SELECTION: AdminHierarchySelection = {
  allianceId: null,
  allianceName: null,
  associationId: null,
  associationName: null,
  branchId: null,
  branchName: null,
};

// useSyncExternalStore requires getSnapshot/getServerSnapshot to return a stable (cached) value
// unless the store has actually changed. Otherwise React can enter an update loop.
const EMPTY_SNAPSHOT: AdminHierarchySnapshot = { hasSelection: false, selection: EMPTY_SELECTION };
let cachedRaw: string | null = null;
let cachedSnapshot: AdminHierarchySnapshot = EMPTY_SNAPSHOT;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getAdminHierarchySelection(): { hasSelection: boolean; selection: AdminHierarchySelection } {
  if (typeof window === "undefined") {
    return EMPTY_SNAPSHOT;
  }

  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedSnapshot;
    if (!raw) {
      cachedRaw = null;
      cachedSnapshot = EMPTY_SNAPSHOT;
      return cachedSnapshot;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) throw new Error("Invalid selection JSON");

    const selection: AdminHierarchySelection = {
      allianceId: normalizeString(parsed.allianceId),
      allianceName: normalizeString(parsed.allianceName),
      associationId: normalizeString(parsed.associationId),
      associationName: normalizeString(parsed.associationName),
      branchId: normalizeString(parsed.branchId),
      branchName: normalizeString(parsed.branchName),
    };

    cachedRaw = raw;
    cachedSnapshot = { hasSelection: true, selection };
    return cachedSnapshot;
  } catch {
    cachedRaw = null;
    cachedSnapshot = EMPTY_SNAPSHOT;
    return cachedSnapshot;
  }
}

export function setAdminHierarchySelection(next: AdminHierarchySelection | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!next) {
      window.localStorage?.removeItem(STORAGE_KEY);
      cachedRaw = null;
      cachedSnapshot = EMPTY_SNAPSHOT;
      window.dispatchEvent(new Event(EVENT_NAME));
      return;
    }
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    // Cache will be refreshed on next getSnapshot call (raw changes).
    window.dispatchEvent(new Event(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function subscribeAdminHierarchySelection(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export function isAdminHierarchyComplete(sel: AdminHierarchySelection): boolean {
  return !!(sel.allianceId && sel.associationId && sel.branchId);
}

