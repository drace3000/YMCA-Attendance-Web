import { describe, expect, it } from "vitest";

import { generateScheduleCloneExceptionReportPDFBlob } from "@/lib/schedule-clone-constraints-report-pdf-utils";

describe("schedule clone exception report PDF utils", () => {
  it("generates a PDF blob", async () => {
    const blob = await generateScheduleCloneExceptionReportPDFBlob({
      title: "Cloning January 2026 Schedule Exception Report",
      orgLine: "Metro YMCA - Eastside",
      stats: { created_sessions: 10, skipped_sessions: 2, modified_sessions: 0 },
      logoSrc: null,
      groups: [
        {
          event_type: "SKIPPED_MISSING_OCCURRENCE",
          label: "Skipped: Missing weekday occurrence",
          count: 1,
          suggested_resolution: "Manually add the missing session.",
          rows: [
            {
              id: "row-1",
              source_session_id: "sess-src-5",
              target_session_date: null,
              target_day_of_week: "MONDAY",
              target_start_time: "12:00",
              target_end_time: "13:00",
              class: { id: "cls-1", name: "Yoga" },
              location: { id: "loc-1", code: "STUDIO", name: "Studio" },
              details: { reason: "Missing weekday occurrence in target month" },
            },
          ],
        },
      ],
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  }, 20000);
});

