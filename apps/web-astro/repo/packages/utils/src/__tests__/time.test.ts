import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { toUtcDate } from "../time";

describe("toUtcDate", () => {
  it("converts local datetime to UTC", () => {
    const date = "1990-01-01";
    const time = "08:30";
    const timezone = "America/New_York";
    const utc = toUtcDate(date, time, false, timezone);
    const expected = DateTime.fromISO(`${date}T${time}`, { zone: timezone }).toUTC().toJSDate();
    expect(utc.toISOString()).toBe(expected.toISOString());
  });
});
