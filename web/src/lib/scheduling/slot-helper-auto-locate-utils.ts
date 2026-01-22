export const SLOT_HELPER_WEEKDAY_ORDER = [
  "SATURDAY",
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
] as const;

export type SlotHelperWeekday = (typeof SLOT_HELPER_WEEKDAY_ORDER)[number];

export interface AutoLocateRow {
  day_of_week: SlotHelperWeekday;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm
}

export function getWeekdayIndex(dayOfWeek: string): number {
  const up = String(dayOfWeek ?? "").trim().toUpperCase();
  const idx = (SLOT_HELPER_WEEKDAY_ORDER as readonly string[]).indexOf(up);
  return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
}

export function sortAutoLocateRows<T extends AutoLocateRow>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const ai = getWeekdayIndex(a.day_of_week);
    const bi = getWeekdayIndex(b.day_of_week);
    if (ai !== bi) return ai - bi;

    // ISO date sorts lexicographically.
    const dateCompare = String(a.date).localeCompare(String(b.date));
    if (dateCompare !== 0) return dateCompare;

    const startCompare = String(a.start_time).localeCompare(String(b.start_time));
    if (startCompare !== 0) return startCompare;

    return String(a.end_time).localeCompare(String(b.end_time));
  });
}

