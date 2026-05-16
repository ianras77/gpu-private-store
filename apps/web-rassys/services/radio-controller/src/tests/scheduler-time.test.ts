import { describe, expect, it, vi } from "vitest";

vi.mock("../redis", () => ({
  redis: {}
}));

vi.mock("../db", () => ({
  prisma: {}
}));

import { buildCurrentMoodFrame, normalizeStationMood } from "../scheduler";

describe("station clock mood framing", () => {
  it("uses the station's Eastern clock instead of the server timezone", () => {
    const frame = buildCurrentMoodFrame({
      rawMood: "late-night warmth / candlelit drift",
      now: new Date("2026-05-16T14:00:00.000Z"),
      queueDepth: 2,
      requestCount: 0,
      recentLead: "test"
    });

    expect(frame.dayOfWeek).toBe("Saturday");
    expect(frame.dayPart).toBe("late morning");
    expect(frame.timeOfDay).toBe("10:00 AM");
    expect(frame.mood).not.toContain("late night");
    expect(frame.mood).not.toContain("candlelit");
  });

  it("throws away stale night-language during daytime", () => {
    const mood = normalizeStationMood("late-night warmth / candlelit drift", {
      dayPart: "late morning",
      emotionalWeather: "steady shine",
      dayOfWeek: "Saturday"
    });

    expect(mood).toBe("late morning / steady shine");
  });
});
