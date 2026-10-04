import { describe, expect, it } from "vitest";
import { isLibraryScanRecent } from "../library/scan-freshness";

const MINUTE = 60 * 1000;

describe("isLibraryScanRecent", () => {
  it("allows slow SMB scans within the 15-minute minimum window", () => {
    expect(isLibraryScanRecent(0, 7 * MINUTE, 30)).toBe(true);
  });

  it("rejects scans older than the bounded minimum window", () => {
    expect(isLibraryScanRecent(0, 16 * MINUTE, 30)).toBe(false);
  });

  it("scales the window for deliberately slower refresh intervals", () => {
    expect(isLibraryScanRecent(0, 20 * MINUTE, 120)).toBe(true);
    expect(isLibraryScanRecent(0, 25 * MINUTE, 120)).toBe(false);
  });

  it("rejects missing, invalid, and future scan timestamps", () => {
    expect(isLibraryScanRecent(null, 0, 30)).toBe(false);
    expect(isLibraryScanRecent(Number.NaN, 0, 30)).toBe(false);
    expect(isLibraryScanRecent(1, 0, 30)).toBe(false);
    expect(isLibraryScanRecent(0, Number.POSITIVE_INFINITY, 30)).toBe(false);
  });
});
