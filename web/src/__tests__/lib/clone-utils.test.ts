import { describe, expect, it } from "vitest";

import {
  addMonthsIso,
  dateForNthWeekdayOfMonth,
  mapSessionDateToNextMonthByWeekdayOrdinal,
  nthWeekdayInMonth,
  weekdayFromIsoDateUtc,
} from "@/lib/scheduling/clone-utils";

describe("clone-utils", () => {
  it("computes next month start date", () => {
    expect(addMonthsIso("2026-01-01", 1)).toBe("2026-02-01");
    expect(addMonthsIso("2025-12-01", 1)).toBe("2026-01-01");
  });

  it("computes weekday and ordinal occurrence within a month", () => {
    expect(weekdayFromIsoDateUtc("2026-01-05")).toBe("MONDAY");
    expect(nthWeekdayInMonth("2026-01-05")).toBe(1); // first Monday of Jan 2026
    expect(nthWeekdayInMonth("2026-01-12")).toBe(2); // second Monday
  });

  it("maps source session date to target month by weekday ordinal", () => {
    // 1st Monday of Dec 2025 is 2025-12-01; 1st Monday of Jan 2026 is 2026-01-05
    const mapped = mapSessionDateToNextMonthByWeekdayOrdinal({
      sourceSessionDate: "2025-12-01",
      sourceMonthStartIsoDate: "2025-12-01",
      targetMonthStartIsoDate: "2026-01-01",
    });
    expect(mapped.weekday).toBe("MONDAY");
    expect(mapped.occurrence).toBe(1);
    expect(mapped.targetSessionDate).toBe("2026-01-05");
  });

  it("returns null when target month does not have the same weekday occurrence", () => {
    // 5th Monday of March 2026 is 2026-03-30; April 2026 has only 4 Mondays.
    const occurrence = nthWeekdayInMonth("2026-03-30");
    expect(occurrence).toBe(5);

    const target = dateForNthWeekdayOfMonth({
      monthStartIsoDate: "2026-04-01",
      weekday: "MONDAY",
      occurrence: 5,
    });
    expect(target).toBeNull();
  });
});

