import { describe, expect, it } from "vitest";
import { nextDrawAction } from "./draw";

describe("permissionless draw progression", () => {
  it("does not offer close before the cutoff", () => {
    expect(nextDrawAction({ phase: 0, now: 99, scheduledCutoff: 100 })).toBeNull();
  });

  it("maps every ready phase to exactly one public action", () => {
    expect(nextDrawAction({ phase: 0, now: 100, scheduledCutoff: 100 })).toBe("closeDraw");
    expect(nextDrawAction({ phase: 1, now: 100, scheduledCutoff: 100 })).toBe("processAccrualBatch");
    expect(nextDrawAction({ phase: 2, now: 100, scheduledCutoff: 100 })).toBe("randomizeDraw");
    expect(nextDrawAction({ phase: 3, now: 100, scheduledCutoff: 100 })).toBe("processSelectionBatch");
  });
});
