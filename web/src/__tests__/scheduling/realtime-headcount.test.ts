import { describe, expect, it } from "vitest";
import { applyHeadcountUpdate } from "@/lib/scheduling/realtime-headcount";

describe("applyHeadcountUpdate", () => {
  it("returns the same array when session is not found", () => {
    const sessions = [{ id: "a", headcount: 1 }];
    const next = applyHeadcountUpdate(sessions, { id: "missing", headcount: 9 });
    expect(next).toBe(sessions);
  });

  it("returns the same array when headcount is unchanged", () => {
    const sessions = [{ id: "a", headcount: 1 }];
    const next = applyHeadcountUpdate(sessions, { id: "a", headcount: 1 });
    expect(next).toBe(sessions);
  });

  it("updates only the matching session headcount", () => {
    const a = { id: "a", headcount: 1 };
    const b = { id: "b", headcount: 2 };
    const sessions = [a, b];

    const next = applyHeadcountUpdate(sessions, { id: "b", headcount: 7 });

    expect(next).not.toBe(sessions);
    expect(next[0]).toBe(a);
    expect(next[1]).not.toBe(b);
    expect(next[1]).toEqual({ id: "b", headcount: 7 });
  });
});

