import { describe, expect, it } from "vitest";
import type { NatalChart } from "@astro/astro-core";
import { buildSynastryFactGraph } from "../synastry";

const chart = (degree: number): NatalChart => ({
  points: [{ key: "Sun", type: "planet", degree, sign: "Aries", signDegree: degree, house: 1 }],
  aspects: [],
  meta: { timeUnknown: false, timezone: "UTC", calculatedAt: "2026-01-01T00:00:00.000Z" }
});

describe("synastry fact graph", () => {
  it("creates only mathematically present cross-chart aspects", () => {
    const graph = buildSynastryFactGraph(chart(10), chart(100), "a", "b");
    expect(graph.facts).toHaveLength(1);
    expect(graph.facts[0]?.value).toMatchObject({ aspect: "square", personA: "Sun", personB: "Sun" });
  });
});
