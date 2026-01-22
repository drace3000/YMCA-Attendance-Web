import { describe, expect, it } from "vitest";

import { sortAutoLocateRows } from "@/lib/scheduling/slot-helper-auto-locate-utils";

describe("slot-helper-auto-locate-utils", () => {
  it("sorts by weekday SAT..FRI, then date, then start/end time", () => {
    const input = [
      { day_of_week: "WEDNESDAY", date: "2025-12-10", start_time: "12:30", end_time: "13:15" },
      { day_of_week: "MONDAY", date: "2025-12-08", start_time: "12:30", end_time: "13:15" },
      { day_of_week: "MONDAY", date: "2025-12-15", start_time: "12:30", end_time: "13:15" },
      { day_of_week: "FRIDAY", date: "2025-12-05", start_time: "12:30", end_time: "13:15" },
      { day_of_week: "WEDNESDAY", date: "2025-12-03", start_time: "12:30", end_time: "13:15" },
      { day_of_week: "WEDNESDAY", date: "2025-12-03", start_time: "11:00", end_time: "11:45" },
    ];

    const out = sortAutoLocateRows(input);
    expect(out.map((r) => `${r.day_of_week} ${r.date} ${r.start_time}-${r.end_time}`)).toEqual([
      // MONDAY group first
      "MONDAY 2025-12-08 12:30-13:15",
      "MONDAY 2025-12-15 12:30-13:15",
      // WEDNESDAY group next, with time ordering within same date
      "WEDNESDAY 2025-12-03 11:00-11:45",
      "WEDNESDAY 2025-12-03 12:30-13:15",
      "WEDNESDAY 2025-12-10 12:30-13:15",
      // FRIDAY group last
      "FRIDAY 2025-12-05 12:30-13:15",
    ]);
  });
});

