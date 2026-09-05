import { describe, expect, it } from "vitest";
import { buildChartFactGraph } from "../index";
import type { NatalChart } from "@astro/astro-core";

const chart: NatalChart = { points: [{ key: "Sun", type: "planet", degree: 10, sign: "Aries", signDegree: 10 }, { key: "Asc", type: "angle", degree: 20, sign: "Taurus", signDegree: 20 }], aspects: [], meta: { timeUnknown: true, timezone: "UTC", calculatedAt: "2026-01-01T00:00:00.000Z" } };
describe("chart fact graph", () => { it("is stable and propagates unknown time", () => { const graph = buildChartFactGraph(chart, "fixture"); expect(graph.schemaVersion).toBe("1.0.0"); expect(graph.facts.map((f) => f.id)).toEqual(["placement:sun", "angle:asc", "dominant:elements", "dominant:modalities", "dominant:planets", "dominant:signs", "uncertainty:birth-time"]); expect(graph.facts.find((f) => f.id === "angle:asc")?.confidence).toBe("unknown"); expect(graph.facts.find((f) => f.id === "dominant:houses")).toBeUndefined(); }); });
