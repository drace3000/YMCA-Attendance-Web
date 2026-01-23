export interface PersistedScheduleSelection {
  program_group_id: string;
  schedule_id: string;
  month_start: string; // YYYY-MM-DD
}

const STORAGE_VERSION = "v1";
const STORAGE_PREFIX = `ymca-smart-scheduler-selected-schedule:${STORAGE_VERSION}`;

function normalizeNonEmpty(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length > 0 ? v : null;
}

export function getPersistedScheduleSelectionStorageKey(opts: {
  userId: string | null | undefined;
  branchId: string | null | undefined;
}): string | null {
  const userId = normalizeNonEmpty(opts.userId);
  const branchId = normalizeNonEmpty(opts.branchId);
  if (!userId || !branchId) return null;
  return `${STORAGE_PREFIX}:${userId}:${branchId}`;
}

export function isPersistedScheduleSelection(value: unknown): value is PersistedScheduleSelection {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const programGroupId = normalizeNonEmpty(v.program_group_id);
  const scheduleId = normalizeNonEmpty(v.schedule_id);
  const monthStart = normalizeNonEmpty(v.month_start);
  if (!programGroupId || !scheduleId || !monthStart) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(monthStart);
}

export function parsePersistedScheduleSelection(raw: string | null | undefined): PersistedScheduleSelection | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isPersistedScheduleSelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializePersistedScheduleSelection(value: PersistedScheduleSelection): string {
  // Keep it strict: only serialize known-good shapes.
  if (!isPersistedScheduleSelection(value)) {
    throw new Error("Invalid PersistedScheduleSelection");
  }
  return JSON.stringify(value);
}

