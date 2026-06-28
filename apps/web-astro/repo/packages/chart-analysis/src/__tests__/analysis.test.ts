import { describe, expect, it } from "vitest";
import type { NatalChart } from "@astro/astro-core";
import { analyzeChart } from "../analysis";

const chart: NatalChart = {
  points: [
    { key: "Sun", type: "planet", degree: 120, sign: "Leo", signDegree: 0, house: 10 },
    { key: "Moon", type: "planet", degree: 212, sign: "Scorpio", signDegree: 2, house: 1 },
    { key: "Mercury", type: "planet", degree: 95, sign: "Cancer", signDegree: 5, house: 9 },
    { key: "Venus", type: "planet", degree: 144, sign: "Leo", signDegree: 24, house: 10 },
    { key: "Mars", type: "planet", degree: 302, sign: "Aquarius", signDegree: 2, house: 4 },
    { key: "Jupiter", type: "planet", degree: 18, sign: "Aries", signDegree: 18, house: 6 },
    { key: "Saturn", type: "planet", degree: 210, sign: "Scorpio", signDegree: 0, house: 1 },
    { key: "Uranus", type: "planet", degree: 248, sign: "Sagittarius", signDegree: 8, house: 2 },
    { key: "Neptune", type: "planet", degree: 269, sign: "Sagittarius", signDegree: 29, house: 3 },
    { key: "Pluto", type: "planet", degree: 210, sign: "Scorpio", signDegree: 0, house: 1 },
    { key: "Asc", type: "angle", degree: 205, sign: "Libra", signDegree: 25 },
    { key: "MC", type: "angle", degree: 115, sign: "Cancer", signDegree: 25 }
  ],
  aspects: [
    { type: "square", between: ["Moon", "Mars"], orb: 0.5, exact: 90 },
    { type: "conjunction", between: ["Moon", "Saturn"], orb: 2, exact: 0 }
  ],
  houses: {
    system: "placidus",
    cusps: Array.from({ length: 12 }, (_, index) => index * 30),
    ascendant: 205,
    midheaven: 115
  },
  meta: {
    timeUnknown: false,
    timezone: "UTC",
    calculatedAt: "2026-01-01T00:00:00.000Z",
    calculationConfidence: "canonical"
  }
};

describe("analyzeChart", () => {
  it("creates deterministic internal map assignments", () => {
    const analysis = analyzeChart(chart);

    expect(analysis.version).toBe("0.1.0");
    expect(analysis.internalMap.root.chartBasis).toContain("Moon in Scorpio, House 1");
    expect(analysis.internalMap.serviceGate.chartBasis).toContain("Sun in Leo, House 10");
    expect(analysis.internalMap.paths.length).toBeGreaterThan(0);
    expect(analysis.integrationTensions[0]?.chartBasis).toContain("Moon & Mars square");
  });
});
