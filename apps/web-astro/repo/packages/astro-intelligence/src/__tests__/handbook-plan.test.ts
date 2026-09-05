import { describe, expect, it } from "vitest";
import { buildChartFactGraph } from "@astro/astro-analysis";
import { planLifeHandbook } from "../index";
import type { NatalChart } from "@astro/astro-core";

const chart: NatalChart = { points: [{ key: "Sun", type: "planet", degree: 10, sign: "Aries", signDegree: 10, house: 5 }, { key: "Asc", type: "angle", degree: 20, sign: "Taurus", signDegree: 20 }], aspects: [{ type: "trine", between: ["Sun", "Asc"], orb: 1, exact: 0 }], houses: { system: "placidus", cusps: Array(12).fill(0), ascendant: 20, midheaven: 100 }, meta: { timeUnknown: false, timezone: "UTC", calculatedAt: "2026-01-01T00:00:00.000Z" } };
describe("life handbook planning", () => {
  it("does not invent biography or unsupplied frameworks", () => {
    const plan = planLifeHandbook({ graph: buildChartFactGraph(chart, "fixture"), context: [] });
    expect(plan.sections.some((section) => section.key === "life-narrative")).toBe(false);
    expect(plan.sections.some((section) => section.key === "framework-integration")).toBe(false);
    expect(plan.omissions).toContain("life-narrative: no approved life context");
  });
});
