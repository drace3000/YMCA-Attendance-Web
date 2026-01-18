import { describe, expect, it } from "vitest";
import { buildSlotHelperAvailability, type SlotHelperHolidayClosure } from "@/lib/scheduling/slot-helper";
import type { InstructorAvailability, SessionForConflicts } from "@/lib/scheduling/conflict-engine";

describe("slot-helper", () => {
  it("generates slots within Availability Time Range and respects duration + step", () => {
    const sessions: SessionForConflicts[] = [];

    const res = buildSlotHelperAvailability({
      scheduleMonth: "2025-12",
      dayStartHHmm: "06:00",
      dayEndHHmm: "07:00",
      sessions,
      locationIds: ["L1"],
      instructorIds: ["I1"],
      instructorAvailability: [], // no rules => anytime
      holidays: [],
      durationMinutes: 30,
      transitionMinutes: 0,
      turnoverMinutes: 0,
      dayFilter: "ALL",
      stepMinutes: 15,
    });

    const dec01 = res.find((d) => d.date === "2025-12-01");
    expect(dec01).toBeTruthy();
    expect(dec01!.slots.map((s) => `${s.start_time}-${s.end_time}`).slice(0, 3)).toEqual([
      "06:00-06:30",
      "06:15-06:45",
      "06:30-07:00",
    ]);
    // last slot must end <= 07:00
    expect(dec01!.slots.every((s) => s.end_time <= "07:00")).toBe(true);
  });

  it("filters instructors by month/day availability windows (when rules exist); no-rules => anytime", () => {
    const sessions: SessionForConflicts[] = [];
    const availability: InstructorAvailability[] = [
      {
        instructor_id: "I1",
        schedule_month: "2025-12",
        day_of_week: "MONDAY",
        available_start: "09:00",
        available_end: "10:00",
      },
    ];

    const res = buildSlotHelperAvailability({
      scheduleMonth: "2025-12",
      dayStartHHmm: "09:00",
      dayEndHHmm: "10:00",
      sessions,
      locationIds: ["L1"],
      instructorIds: ["I1", "I2"], // I2 has no rules
      instructorAvailability: availability,
      holidays: [],
      durationMinutes: 60,
      transitionMinutes: 0,
      turnoverMinutes: 0,
      dayFilter: "MONDAY",
      stepMinutes: 15,
    });

    const mon = res.find((d) => d.day_of_week === "MONDAY");
    expect(mon).toBeTruthy();
    expect(mon!.slots.length).toBe(1);
    // both instructors should be available for 09:00-10:00 (I1 within window, I2 anytime)
    expect(mon!.slots[0].availableInstructorIds.sort()).toEqual(["I1", "I2"]);

    // Now pick a time outside I1 window by changing day bounds; I1 should disappear but I2 remains.
    const res2 = buildSlotHelperAvailability({
      scheduleMonth: "2025-12",
      dayStartHHmm: "10:00",
      dayEndHHmm: "11:00",
      sessions,
      locationIds: ["L1"],
      instructorIds: ["I1", "I2"],
      instructorAvailability: availability,
      holidays: [],
      durationMinutes: 60,
      transitionMinutes: 0,
      turnoverMinutes: 0,
      dayFilter: "MONDAY",
      stepMinutes: 15,
    });
    const mon2 = res2.find((d) => d.day_of_week === "MONDAY");
    expect(mon2).toBeTruthy();
    expect(mon2!.slots.length).toBe(1);
    expect(mon2!.slots[0].availableInstructorIds).toEqual(["I2"]);
  });

  it("respects location turnover and instructor transition buffers by marking them busy around sessions", () => {
    const sessions: SessionForConflicts[] = [
      {
        id: "S1",
        day_of_week: "MONDAY",
        session_date: "2025-12-01",
        start_time: "09:00",
        end_time: "10:00",
        location_id: "L1",
        instructor_ids: ["I1"],
      },
    ];

    const res = buildSlotHelperAvailability({
      scheduleMonth: "2025-12",
      dayStartHHmm: "08:00",
      dayEndHHmm: "11:00",
      sessions,
      locationIds: ["L1", "L2"],
      instructorIds: ["I1", "I2"],
      instructorAvailability: [],
      holidays: [],
      durationMinutes: 60,
      transitionMinutes: 15, // instructor busy 08:45-10:15
      turnoverMinutes: 15, // location busy 08:45-10:15
      dayFilter: "ALL",
      stepMinutes: 15,
    });

    const dec01 = res.find((d) => d.date === "2025-12-01")!;
    // Candidate 08:00-09:00 overlaps buffered busy window for I1/L1 (08:45-10:15) => should NOT offer I1 for that slot and not offer L1.
    const slot0800 = dec01.slots.find((s) => s.start_time === "08:00" && s.end_time === "09:00");
    expect(slot0800).toBeTruthy();
    expect(slot0800!.availableLocationIds).toEqual(["L2"]); // L1 blocked, L2 ok
    expect(slot0800!.availableInstructorIds).toEqual(["I2"]); // I1 blocked, I2 ok

    // Candidate 10:15-11:15 isn't possible due to dayEnd=11:00; but 10:00-11:00 overlaps until 10:15, so I1/L1 should still be blocked.
    const slot1000 = dec01.slots.find((s) => s.start_time === "10:00" && s.end_time === "11:00");
    expect(slot1000).toBeTruthy();
    expect(slot1000!.availableLocationIds).toEqual(["L2"]);
    expect(slot1000!.availableInstructorIds).toEqual(["I2"]);
  });

  it("blocks slots on fully-closed holidays and blocks partial-day closures", () => {
    const sessions: SessionForConflicts[] = [];
    const holidays: SlotHelperHolidayClosure[] = [
      { date: "2025-12-01", is_closed: true }, // full day
      { date: "2025-12-02", is_closed: true, closed_start_time: "09:00", closed_end_time: "10:00" }, // partial
    ];

    const res = buildSlotHelperAvailability({
      scheduleMonth: "2025-12",
      dayStartHHmm: "08:00",
      dayEndHHmm: "11:00",
      sessions,
      locationIds: ["L1"],
      instructorIds: ["I1"],
      instructorAvailability: [],
      holidays,
      durationMinutes: 60,
      transitionMinutes: 0,
      turnoverMinutes: 0,
      dayFilter: "ALL",
      stepMinutes: 15,
    });

    const dec01 = res.find((d) => d.date === "2025-12-01")!;
    expect(dec01.slots.length).toBe(0);

    const dec02 = res.find((d) => d.date === "2025-12-02")!;
    // 08:00-09:00 allowed, 09:00-10:00 blocked, 10:00-11:00 allowed
    expect(dec02.slots.some((s) => s.start_time === "08:00" && s.end_time === "09:00")).toBe(true);
    expect(dec02.slots.some((s) => s.start_time === "09:00" && s.end_time === "10:00")).toBe(false);
    expect(dec02.slots.some((s) => s.start_time === "10:00" && s.end_time === "11:00")).toBe(true);
  });
});


