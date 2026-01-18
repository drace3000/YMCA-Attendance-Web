import { describe, expect, it } from "vitest";
import { detectScheduleConflicts, type SessionForConflicts } from "@/lib/scheduling/conflict-engine";

function s(overrides: Partial<SessionForConflicts>): SessionForConflicts {
  return {
    id: overrides.id ?? "s-1",
    day_of_week: overrides.day_of_week ?? "SATURDAY",
    session_date: overrides.session_date ?? "2025-12-06",
    start_time: overrides.start_time ?? "08:00",
    end_time: overrides.end_time ?? "09:00",
    class_name: overrides.class_name ?? "CLASS",
    location_code: overrides.location_code ?? "STUDIO",
    location_id: overrides.location_id ?? "loc-1",
    instructor_ids: overrides.instructor_ids ?? ["inst-1"],
  };
}

describe("conflict-engine (spec scenarios 1-5)", () => {
  it("detects instructor double-booking (HIGH) when times overlap on same date", () => {
    const a = s({ id: "a", start_time: "08:00", end_time: "09:00", location_code: "S", instructor_ids: ["jennw"] });
    const b = s({ id: "b", start_time: "08:30", end_time: "09:30", location_code: "MB", instructor_ids: ["jennw"] });

    const conflicts = detectScheduleConflicts([a, b]);
    expect(conflicts.some((c) => c.type === "INSTRUCTOR_DOUBLE_BOOKING" && c.severity === "HIGH")).toBe(true);
  });

  it("detects instructor double-booking (HIGH) for multi-instructor sessions when any instructor overlaps", () => {
    const a = s({ id: "a", start_time: "08:00", end_time: "09:00", instructor_ids: ["a", "b"] });
    const b = s({ id: "b", start_time: "08:30", end_time: "09:30", instructor_ids: ["b", "c"] });

    const conflicts = detectScheduleConflicts([a, b]);
    expect(conflicts.some((c) => c.type === "INSTRUCTOR_DOUBLE_BOOKING" && c.severity === "HIGH")).toBe(true);
  });

  it("detects location double-booking (HIGH) when times overlap on same date", () => {
    const a = s({ id: "a", start_time: "09:00", end_time: "10:00", location_code: "STUDIO", instructor_ids: ["nanette"] });
    const b = s({ id: "b", start_time: "09:15", end_time: "10:00", location_code: "STUDIO", instructor_ids: ["frieda"] });

    const conflicts = detectScheduleConflicts([a, b]);
    expect(conflicts.some((c) => c.type === "LOCATION_DOUBLE_BOOKING" && c.severity === "HIGH")).toBe(true);
  });

  it("detects location double-booking using location_id when location_code is missing", () => {
    const a = s({ id: "a", start_time: "09:00", end_time: "10:00", location_code: null, location_id: "loc-x" });
    const b = s({ id: "b", start_time: "09:30", end_time: "10:30", location_code: null, location_id: "loc-x" });

    const conflicts = detectScheduleConflicts([a, b]);
    expect(conflicts.some((c) => c.type === "LOCATION_DOUBLE_BOOKING" && c.severity === "HIGH")).toBe(true);
  });

  it("detects location turnover warning (LOW) for back-to-back different classes in same location", () => {
    const a = s({ id: "a", start_time: "09:00", end_time: "10:00", location_code: "STUDIO", class_name: "BODYPUMP™", instructor_ids: ["jennw"] });
    const b = s({ id: "b", start_time: "10:00", end_time: "11:00", location_code: "STUDIO", class_name: "ZUMBA®", instructor_ids: ["other"] });

    const conflicts = detectScheduleConflicts([a, b], { minLocationTurnoverMinutes: 15 });
    expect(conflicts.some((c) => c.type === "LOCATION_TURNOVER_TIME" && c.severity === "LOW")).toBe(true);
  });

  it("detects instructor transition warning (MEDIUM) when gap is under threshold and location changes", () => {
    const a = s({ id: "a", start_time: "08:00", end_time: "09:00", location_code: "SPC", instructor_ids: ["mikey"] });
    const b = s({ id: "b", start_time: "09:10", end_time: "10:10", location_code: "STUDIO", instructor_ids: ["mikey"] });

    const conflicts = detectScheduleConflicts([a, b], { minInstructorTransitionMinutes: 15 });
    expect(conflicts.some((c) => c.type === "INSTRUCTOR_TRANSITION_TIME" && c.severity === "MEDIUM")).toBe(true);
  });

  it("does not flag transition warning when adequate gap exists", () => {
    const a = s({ id: "a", start_time: "08:00", end_time: "09:00", location_code: "MB", instructor_ids: ["julie"] });
    const b = s({ id: "b", start_time: "09:30", end_time: "10:30", location_code: "STUDIO", instructor_ids: ["julie"] });

    const conflicts = detectScheduleConflicts([a, b], { minInstructorTransitionMinutes: 15 });
    expect(conflicts.some((c) => c.type === "INSTRUCTOR_TRANSITION_TIME")).toBe(false);
  });

  it("detects instructor max hours warning (MEDIUM) when total minutes exceeds cap", () => {
    const a = s({ id: "a", start_time: "08:00", end_time: "10:00", instructor_ids: ["mikey"] }); // 120
    const b = s({ id: "b", start_time: "10:30", end_time: "14:30", instructor_ids: ["mikey"] }); // 240 => total 360
    const c = s({ id: "c", start_time: "15:00", end_time: "16:00", instructor_ids: ["mikey"] }); // 60 => total 420

    const conflicts = detectScheduleConflicts([a, b, c], { maxDailyInstructorMinutes: 360 });
    expect(conflicts.some((x) => x.type === "INSTRUCTOR_MAX_HOURS" && x.severity === "MEDIUM")).toBe(true);
  });
});

describe("conflict-engine (YMCA/project validations)", () => {
  it("flags invalid time format as HIGH", () => {
    const a = s({ id: "a", start_time: "8:00", end_time: "09:00" });
    const conflicts = detectScheduleConflicts([a]);
    expect(conflicts.some((c) => c.type === "INVALID_TIME_FORMAT" && c.severity === "HIGH")).toBe(true);
  });

  it("flags invalid time range (end <= start) as HIGH", () => {
    const a = s({ id: "a", start_time: "10:00", end_time: "10:00" });
    const conflicts = detectScheduleConflicts([a]);
    expect(conflicts.some((c) => c.type === "INVALID_TIME_RANGE" && c.severity === "HIGH")).toBe(true);
  });

  it("flags day-of-week mismatch as HIGH when session_date does not match day_of_week", () => {
    // 2026-01-04 is a Sunday (UTC)
    const a = s({ id: "a", session_date: "2026-01-04", day_of_week: "MONDAY" });
    const conflicts = detectScheduleConflicts([a]);
    expect(conflicts.some((c) => c.type === "DAY_OF_WEEK_MISMATCH" && c.severity === "HIGH")).toBe(true);
  });

  it("flags schedule month mismatch as HIGH when scheduleMonth is provided", () => {
    const a = s({ id: "a", session_date: "2026-02-01", day_of_week: "SUNDAY" });
    const conflicts = detectScheduleConflicts([a], { scheduleMonth: "2026-01" });
    expect(conflicts.some((c) => c.type === "OUTSIDE_SCHEDULE_MONTH" && c.severity === "HIGH")).toBe(true);
  });

  it("flags closed holiday as HIGH (blocking)", () => {
    const a = s({ id: "a", session_date: "2025-12-25", day_of_week: "THURSDAY" });
    const conflicts = detectScheduleConflicts([a], { holidayDates: ["2025-12-25"] });
    expect(conflicts.some((c) => c.type === "HOLIDAY" && c.severity === "HIGH")).toBe(true);
  });

  it("does not flag holiday when there are no closures provided (default)", () => {
    const a = s({ id: "a", session_date: "2025-12-25", day_of_week: "THURSDAY" });
    const conflicts = detectScheduleConflicts([a], { holidayClosures: [] });
    expect(conflicts.some((c) => c.type === "HOLIDAY")).toBe(false);
  });

  it("flags partial-day holiday closure only when session overlaps the closed window", () => {
    const a = s({ id: "a", session_date: "2026-07-04", day_of_week: "SATURDAY", start_time: "08:30", end_time: "09:00" });
    const b = s({ id: "b", session_date: "2026-07-04", day_of_week: "SATURDAY", start_time: "10:00", end_time: "11:00" });

    const conflictsA = detectScheduleConflicts([a], {
      holidayClosures: [{ date: "2026-07-04", closed_start_time: "08:00", closed_end_time: "09:30" }],
    });
    expect(conflictsA.some((c) => c.type === "HOLIDAY" && c.severity === "HIGH")).toBe(true);

    const conflictsB = detectScheduleConflicts([b], {
      holidayClosures: [{ date: "2026-07-04", closed_start_time: "08:00", closed_end_time: "09:30" }],
    });
    expect(conflictsB.some((c) => c.type === "HOLIDAY")).toBe(false);
  });

  it("flags instructor outside availability as HIGH when availability entries exist for the month and session is not fully contained", () => {
    const a = s({
      id: "a",
      session_date: "2025-12-06",
      day_of_week: "SATURDAY",
      start_time: "08:30",
      end_time: "09:00",
      instructor_ids: ["inst-1"],
    });

    const conflicts = detectScheduleConflicts([a], {
      scheduleMonth: "2025-12",
      instructorAvailability: [
        {
          instructor_id: "inst-1",
          schedule_month: "2025-12",
          day_of_week: "SATURDAY",
          available_start: "09:00",
          available_end: "10:00",
        },
      ],
    });

    expect(
      conflicts.some((c) => c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY" && c.severity === "HIGH"),
    ).toBe(true);
  });

  it("does not enforce availability when no availability entries exist for the month (assume available)", () => {
    const a = s({
      id: "a",
      session_date: "2025-12-06",
      day_of_week: "SATURDAY",
      start_time: "08:30",
      end_time: "09:00",
      instructor_ids: ["inst-1"],
    });

    const conflicts = detectScheduleConflicts([a], {
      scheduleMonth: "2025-12",
      instructorAvailability: [],
    });

    expect(conflicts.some((c) => c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY")).toBe(false);
  });

  it("does not enforce availability for an instructor with no rules even if other instructors have availability rules in the month", () => {
    const a = s({
      id: "a",
      session_date: "2025-12-06",
      day_of_week: "SATURDAY",
      start_time: "08:30",
      end_time: "09:00",
      instructor_ids: ["inst-1"], // inst-1 has NO rules
    });

    const conflicts = detectScheduleConflicts([a], {
      scheduleMonth: "2025-12",
      instructorAvailability: [
        {
          instructor_id: "inst-other",
          schedule_month: "2025-12",
          day_of_week: "SATURDAY",
          available_start: "06:00",
          available_end: "20:00",
        },
      ],
    });

    expect(conflicts.some((c) => c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY")).toBe(false);
  });

  it("flags availability as HIGH when instructor has any availability in the month but none for that day", () => {
    const a = s({
      id: "a",
      session_date: "2025-12-06",
      day_of_week: "SATURDAY",
      start_time: "08:30",
      end_time: "09:00",
      instructor_ids: ["inst-1"],
    });

    const conflicts = detectScheduleConflicts([a], {
      scheduleMonth: "2025-12",
      instructorAvailability: [
        {
          instructor_id: "inst-1",
          schedule_month: "2025-12",
          day_of_week: "MONDAY",
          available_start: "08:00",
          available_end: "10:00",
        },
      ],
    });

    expect(conflicts.some((c) => c.type === "INSTRUCTOR_OUTSIDE_AVAILABILITY" && c.severity === "HIGH")).toBe(true);
  });
});


