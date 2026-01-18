export type Weekday =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toUtcDate(isoDate: string): Date {
  // Expect YYYY-MM-DD
  return new Date(`${isoDate}T00:00:00Z`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addMonthsIso(monthStartIsoDate: string, monthsToAdd: number): string {
  if (!isIsoDate(monthStartIsoDate)) throw new Error("monthStartIsoDate must be YYYY-MM-DD");
  const d = toUtcDate(monthStartIsoDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const next = new Date(Date.UTC(y, m + monthsToAdd, 1));
  return toIsoDate(next);
}

export function monthPrefixFromMonthStart(monthStartIsoDate: string): string {
  if (!isIsoDate(monthStartIsoDate)) throw new Error("monthStartIsoDate must be YYYY-MM-DD");
  return monthStartIsoDate.slice(0, 7);
}

export function weekdayFromIsoDateUtc(isoDate: string): Weekday {
  if (!isIsoDate(isoDate)) throw new Error("isoDate must be YYYY-MM-DD");
  const d = toUtcDate(isoDate);
  // 0=Sunday..6=Saturday
  const day = d.getUTCDay();
  const map: Weekday[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  return map[day]!;
}

export function nthWeekdayInMonth(isoDate: string): number {
  // 1-based occurrence: first Monday=1, second Monday=2, ...
  if (!isIsoDate(isoDate)) throw new Error("isoDate must be YYYY-MM-DD");
  const d = toUtcDate(isoDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const targetWeekday = d.getUTCDay();

  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const cur = new Date(Date.UTC(y, m, day));
    if (cur.getUTCMonth() !== m) break;
    if (cur.getUTCDay() === targetWeekday) {
      count++;
      if (cur.getUTCDate() === d.getUTCDate()) return count;
    }
  }
  throw new Error("date not in its own month?");
}

export function dateForNthWeekdayOfMonth(opts: {
  monthStartIsoDate: string; // "YYYY-MM-DD" where DD is 01
  weekday: Weekday;
  occurrence: number; // 1-based
}): string | null {
  const { monthStartIsoDate, weekday, occurrence } = opts;
  if (!isIsoDate(monthStartIsoDate)) throw new Error("monthStartIsoDate must be YYYY-MM-DD");
  if (occurrence < 1) throw new Error("occurrence must be >= 1");

  const monthStart = toUtcDate(monthStartIsoDate);
  const y = monthStart.getUTCFullYear();
  const m = monthStart.getUTCMonth();

  const map: Record<Weekday, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
  };

  const target = map[weekday];
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const cur = new Date(Date.UTC(y, m, day));
    if (cur.getUTCMonth() !== m) break;
    if (cur.getUTCDay() === target) {
      count++;
      if (count === occurrence) return toIsoDate(cur);
    }
  }
  return null;
}

export function mapSessionDateToNextMonthByWeekdayOrdinal(opts: {
  sourceSessionDate: string; // "YYYY-MM-DD"
  sourceMonthStartIsoDate: string; // "YYYY-MM-DD" (01)
  targetMonthStartIsoDate: string; // "YYYY-MM-DD" (01)
}): { targetSessionDate: string | null; weekday: Weekday; occurrence: number } {
  const { sourceSessionDate, sourceMonthStartIsoDate, targetMonthStartIsoDate } = opts;
  const weekday = weekdayFromIsoDateUtc(sourceSessionDate);
  const occurrence = nthWeekdayInMonth(sourceSessionDate);

  // If source date isn't in the month_start month, we still map by its own month.
  // The sourceMonthStart is used mainly for bookkeeping; mapping is based on weekday+occurrence.
  void sourceMonthStartIsoDate;

  const targetSessionDate = dateForNthWeekdayOfMonth({
    monthStartIsoDate: targetMonthStartIsoDate,
    weekday,
    occurrence,
  });

  return { targetSessionDate, weekday, occurrence };
}

