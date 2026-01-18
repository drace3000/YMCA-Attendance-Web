import { describe, expect, it } from "vitest";

import { buildReschedulePreview } from "@/lib/scheduling/reschedule-preview";

describe("buildReschedulePreview", () => {
  it("proposes the earliest in-month slot within instructor availability that avoids overlaps", () => {
    const sessions = [
      {
        id: "s1",
        day_of_week: "SATURDAY",
        session_date: "2026-01-03",
        start_time: "07:15",
        end_time: "07:45",
        location_id: "loc-1",
        location_code: "A",
        class_name: "GRIT",
        instructor_ids: ["inst-1"],
      },
      // An existing session that blocks Monday 09:00-09:30 for instructor, forcing 09:30-10:00.
      {
        id: "existing",
        day_of_week: "MONDAY",
        session_date: "2026-01-05",
        start_time: "09:00",
        end_time: "09:30",
        location_id: "loc-2",
        location_code: "B",
        class_name: "OTHER",
        instructor_ids: ["inst-1"],
      },
    ];

    const availability = [
      {
        instructor_id: "inst-1",
        schedule_month: "2026-01",
        day_of_week: "MONDAY",
        available_start: "09:00",
        available_end: "10:00",
      },
    ];

    const out = buildReschedulePreview({
      scheduleMonth: "2026-01",
      targetInstructorId: "inst-1",
      relatedSessionIds: ["s1"],
      sessions,
      instructorAvailability: availability,
      stepMinutes: 15,
    });

    expect(out).toHaveLength(1);
    expect(out[0].session_id).toBe("s1");
    expect("date" in out[0].proposal ? out[0].proposal.date : null).toBe("2026-01-05");
    expect("start_time" in out[0].proposal ? out[0].proposal.start_time : null).toBe("09:30");
    expect("end_time" in out[0].proposal ? out[0].proposal.end_time : null).toBe("10:00");
  });

  it("returns a reason when the instructor has no availability windows for the month", () => {
    const sessions = [
      {
        id: "s1",
        day_of_week: "SATURDAY",
        session_date: "2026-01-03",
        start_time: "07:15",
        end_time: "07:45",
        location_id: "loc-1",
        location_code: "A",
        class_name: "GRIT",
        instructor_ids: ["inst-1"],
      },
    ];

    const out = buildReschedulePreview({
      scheduleMonth: "2026-01",
      targetInstructorId: "inst-1",
      relatedSessionIds: ["s1"],
      sessions,
      instructorAvailability: [],
    });

    expect(out).toHaveLength(1);
    expect(out[0].session_id).toBe("s1");
    expect("reason" in out[0].proposal && out[0].proposal.reason).toMatch(/no availability windows/i);
  });
});


