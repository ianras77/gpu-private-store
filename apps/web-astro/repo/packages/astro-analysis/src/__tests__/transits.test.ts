import { describe, expect, it } from "vitest";
import type { NatalChart } from "@astro/astro-core";
import { buildTransitFactGraph } from "../transits";

const chart = (degree: number): NatalChart => ({ points: [{ key: "Sun", type: "planet", degree, sign: "Aries", signDegree: degree, house: 1 }], aspects: [], meta: { timeUnknown: false, timezone: "UTC", calculatedAt: "2026-01-01T00:00:00.000Z", engineVersion: "test" } });

describe("transit fact graph", () => {
  it("emits only actual transit-to-natal aspects with provenance", () => {
    const graph = buildTransitFactGraph({ natalChart: chart(10), transitChart: chart(100), exactAt: "2026-01-02T00:00:00.000Z", timezone: "UTC", source: "test-ephemeris" });
    expect(graph.activations).toHaveLength(1);
    expect(graph.activations[0]).toMatchObject({ label: "Sun square natal Sun", source: "test-ephemeris", exactAt: "2026-01-02T00:00:00.000Z" });
  });
});
