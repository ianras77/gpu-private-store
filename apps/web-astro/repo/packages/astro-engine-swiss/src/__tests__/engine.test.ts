import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";
import { createSwissEngine } from "../index";

const require = createRequire(import.meta.url);

const hasSwissBindings = (() => {
  try {
    require("swisseph");
    return true;
  } catch {
    return false;
  }
})();

const describeIfSwiss = hasSwissBindings ? describe : describe.skip;

const BASE_INPUT = {
  birthDate: "1990-06-15",
  birthTime: "13:45",
  latitude: 40.7128,
  longitude: -74.006,
  timezone: "America/New_York"
} as const;

describeIfSwiss("SwissEphemerisEngine", () => {
  afterEach(() => {
    delete process.env.SWISS_EPHEMERIS_ENABLED;
    delete process.env.SWISS_EPHEMERIS_PATH;
  });

  it("calculates planets, houses, and metadata for known birth input", async () => {
    const engine = createSwissEngine();
    const chart = await engine.calculateChart(BASE_INPUT);

    expect(chart.meta.timeUnknown).toBe(false);
    expect(chart.meta.timezone).toBe("America/New_York");
    expect(chart.meta.birthMomentUtc).toMatch(/Z$/);
    expect(typeof chart.meta.julianDay).toBe("number");
    expect(chart.houses?.system).toBe("placidus");
    expect(chart.houses?.cusps).toHaveLength(12);
    expect(chart.points.filter((point) => point.type === "planet")).toHaveLength(10);
    expect(chart.points.find((point) => point.key === "Asc")).toBeDefined();
    expect(chart.points.find((point) => point.key === "MC")).toBeDefined();

    const sun = chart.points.find((point) => point.key === "Sun");
    expect(sun).toBeDefined();
    expect(sun!.degree).toBeGreaterThanOrEqual(0);
    expect(sun!.degree).toBeLessThan(360);

    for (const point of chart.points) {
      if (point.type === "angle") continue;
      expect(point.house).toBeGreaterThanOrEqual(1);
      expect(point.house).toBeLessThanOrEqual(12);
    }
  });

  it("supports whole-sign house calculations while keeping angle points", async () => {
    const engine = createSwissEngine();
    const chart = await engine.calculateChart(BASE_INPUT, { houseSystem: "whole-sign" });

    expect(chart.houses?.system).toBe("whole-sign");
    expect(chart.houses?.cusps).toHaveLength(12);
    expect(chart.points.find((point) => point.key === "Asc")).toBeDefined();
    expect(chart.points.find((point) => point.key === "MC")).toBeDefined();
  });

  it("adds optional points when requested", async () => {
    const engine = createSwissEngine();
    const chart = await engine.calculateChart(BASE_INPUT, {
      includePoints: {
        northNode: true,
        chiron: true
      }
    });

    const northNode = chart.points.find((point) => point.key === "NorthNode");
    const chiron = chart.points.find((point) => point.key === "Chiron");

    expect(northNode?.type).toBe("point");
    expect(chiron?.type).toBe("point");
  });

  it("omits houses and angles when birth time is unknown", async () => {
    const engine = createSwissEngine();
    const chart = await engine.calculateChart({
      birthDate: BASE_INPUT.birthDate,
      birthTime: undefined,
      timeUnknown: true,
      latitude: BASE_INPUT.latitude,
      longitude: BASE_INPUT.longitude,
      timezone: BASE_INPUT.timezone
    });

    expect(chart.meta.timeUnknown).toBe(true);
    expect(chart.meta.houseSystem).toBeUndefined();
    expect(chart.houses).toBeUndefined();
    expect(chart.points.find((point) => point.key === "Asc")).toBeUndefined();
    expect(chart.points.find((point) => point.key === "MC")).toBeUndefined();
  });

  it("can be explicitly disabled via env", async () => {
    process.env.SWISS_EPHEMERIS_ENABLED = "false";
    const engine = createSwissEngine();

    await expect(engine.calculateChart(BASE_INPUT)).rejects.toThrow(
      "Swiss Ephemeris engine is disabled by SWISS_EPHEMERIS_ENABLED"
    );
  });
});
