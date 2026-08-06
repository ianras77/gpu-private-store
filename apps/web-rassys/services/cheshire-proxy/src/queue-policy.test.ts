import { describe, expect, it } from "vitest";
import {
  canAcquireQueueSlot,
  defaultQueueWaitMs,
  shouldShedBackgroundLane
} from "./queue-policy";

describe("RassyMind queue policy", () => {
  it("keeps one active slot available for listener traffic", () => {
    expect(canAcquireQueueSlot("listener", 2, 3, 1, false)).toBe(true);
    expect(canAcquireQueueSlot("notes", 2, 3, 1, false)).toBe(false);
    expect(canAcquireQueueSlot("notes", 2, 3, 1, true)).toBe(false);
  });

  it("does not shed listener traffic when background work is active", () => {
    expect(canAcquireQueueSlot("listener", 2, 3, 1, true)).toBe(true);
    expect(shouldShedBackgroundLane("notes", true)).toBe(true);
    expect(shouldShedBackgroundLane("listener", true)).toBe(false);
  });

  it("uses bounded waits for listener and optional lanes", () => {
    expect(defaultQueueWaitMs("listener")).toBe(10_000);
    expect(defaultQueueWaitMs("notes")).toBe(0);
    expect(defaultQueueWaitMs("programming")).toBe(2_000);
  });
});
