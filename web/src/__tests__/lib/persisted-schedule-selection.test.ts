import { describe, expect, it } from "vitest";

import {
  getPersistedScheduleSelectionStorageKey,
  parsePersistedScheduleSelection,
  serializePersistedScheduleSelection,
  type PersistedScheduleSelection,
} from "@/lib/persisted-schedule-selection";

describe("persisted schedule selection helpers", () => {
  it("builds a stable per-user+branch storage key", () => {
    const key = getPersistedScheduleSelectionStorageKey({ userId: "user-1", branchId: "br-1" });
    expect(key).toContain("ymca-smart-scheduler-selected-schedule:v1");
    expect(key).toContain("user-1");
    expect(key).toContain("br-1");
  });

  it("returns null key when userId/branchId missing", () => {
    expect(getPersistedScheduleSelectionStorageKey({ userId: null, branchId: "br-1" })).toBeNull();
    expect(getPersistedScheduleSelectionStorageKey({ userId: "user-1", branchId: "" })).toBeNull();
  });

  it("roundtrips serialize/parse for valid selection", () => {
    const value: PersistedScheduleSelection = {
      program_group_id: "pg-1",
      schedule_id: "sch-1",
      month_start: "2025-11-01",
    };
    const raw = serializePersistedScheduleSelection(value);
    expect(parsePersistedScheduleSelection(raw)).toEqual(value);
  });

  it("returns null for invalid JSON or invalid shape", () => {
    expect(parsePersistedScheduleSelection("not-json")).toBeNull();
    expect(parsePersistedScheduleSelection(JSON.stringify({}))).toBeNull();
    expect(
      parsePersistedScheduleSelection(
        JSON.stringify({ program_group_id: "pg-1", schedule_id: "sch-1", month_start: "2025-11" }),
      ),
    ).toBeNull();
  });
});

