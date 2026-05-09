import { describe, expect, it } from "vitest";
import { toJulianDay, toUtcDate } from "@astro/utils";

describe("timezone + datetime pipeline", () => {
  it("handles DST spring-forward boundary in America/New_York", () => {
    const preJump = toUtcDate("2024-03-10", "01:30", false, "America/New_York");
    const postJump = toUtcDate("2024-03-10", "03:30", false, "America/New_York");

    expect(preJump.toISOString()).toBe("2024-03-10T06:30:00.000Z");
    expect(postJump.toISOString()).toBe("2024-03-10T07:30:00.000Z");
  });

  it("converts UTC dates to Julian day correctly", () => {
    const jd = toJulianDay(new Date("2000-01-01T12:00:00.000Z"));
    expect(jd).toBe(2451545);
  });
});
