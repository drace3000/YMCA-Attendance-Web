import { describe, expect, it } from "vitest";

import { buildConflictsChecklistGroups } from "@/lib/schedule-conflicts-checklist-utils";
import type { Session } from "@/app/scheduling/sessions-tab";
import type { ScheduleConflict } from "@/lib/scheduling/conflict-engine";

describe("schedule-conflicts-checklist-utils", () => {
  it("groups HIGH→MEDIUM→LOW and sorts by date ascending within each group", () => {
    const sessions: Session[] = [
      {
        id: "s1",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "c1",
        location_id: "l1",
        day_of_week: "MONDAY",
        start_time: "08:00:00",
        end_time: "09:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "c1", name: "A" },
        location: { id: "l1", code: "ROOM-1", name: "Room 1" },
        instructors: [],
      },
      {
        id: "s2",
        branch_id: "br-1",
        schedule_id: "sch-1",
        class_id: "c2",
        location_id: "l2",
        day_of_week: "MONDAY",
        start_time: "10:00:00",
        end_time: "11:00:00",
        session_date: "2026-01-05",
        headcount: null,
        class: { id: "c2", name: "B" },
        location: { id: "l2", code: "ROOM-2", name: "Room 2" },
        instructors: [],
      },
    ];

    const conflicts: ScheduleConflict[] = [
      {
        type: "HOLIDAY",
        severity: "LOW",
        date: "2026-01-05",
        session_a_id: "s1",
        message: "Low note",
      },
      {
        type: "INSTRUCTOR_TRANSITION_TIME",
        severity: "MEDIUM",
        date: "2026-01-03",
        session_a_id: "s2",
        session_b_id: "s1",
        message: "Medium warning",
      },
      {
        type: "LOCATION_DOUBLE_BOOKING",
        severity: "HIGH",
        date: "2026-01-04",
        session_a_id: "s1",
        session_b_id: "s2",
        message: "High conflict",
      },
    ];

    const groups = buildConflictsChecklistGroups({ conflicts, sessions });
    expect(groups.map((g) => g.severity)).toEqual(["HIGH", "MEDIUM", "LOW"]);

    expect(groups[0].rows[0].dateISO).toBe("2026-01-04");
    expect(groups[1].rows[0].dateISO).toBe("2026-01-03");
    expect(groups[2].rows[0].dateISO).toBe("2026-01-05");

    // Display date is MM/DD/YYYY for reports
    expect(groups[0].rows[0].date).toBe("01/04/2026");

    // Manual checkbox marker is present
    expect(groups[0].rows[0].resolved).toBe("☐");

    // Includes session summaries with time + class + location code
    expect(groups[0].rows[0].sessionA).toContain("08:00–09:00");
    expect(groups[0].rows[0].sessionA).toContain("A");
    expect(groups[0].rows[0].sessionA).toContain("ROOM-1");
  });
});


