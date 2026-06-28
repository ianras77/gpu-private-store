import { describe, expect, it } from "vitest";
import type { NatalChart } from "@astro/astro-core";
import { BRANDS } from "@astro/brands";
import { generateHumanGuide } from "../human-guide";
import { HumanGuideSchema } from "../human-guide-schema";

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
  aspects: [{ type: "square", between: ["Moon", "Mars"], orb: 0.5, exact: 90 }],
  meta: {
    timeUnknown: false,
    timezone: "UTC",
    calculatedAt: "2026-01-01T00:00:00.000Z",
    calculationConfidence: "canonical"
  }
};

describe("generateHumanGuide", () => {
  it("returns schema-valid fallback with internal map and provenance", async () => {
    const result = await generateHumanGuide({
      chart,
      brand: BRANDS.jupiterseek,
      sourceProvenance: [
        {
          title: "The Way of Hermes",
          source: "/data/runtipi/media/data/web-astro/Esoteric/hermes.pdf",
          tags: ["source:hermetic"],
          sections: ["metaFrame", "internalMap"]
        }
      ]
    });

    expect(() => HumanGuideSchema.parse(result.guide)).not.toThrow();
    expect(result.quality.passed).toBe(true);
    expect(result.quality.checks.chartSpecificity.passed).toBe(true);
    expect(result.quality.checks.sourceGrounding.passed).toBe(true);
    expect(result.quality.checks.nonDoctrinalTone.passed).toBe(true);
    expect(result.guide.metaFrame.world).toBe("living-cosmos");
    expect(result.guide.internalMap.root.name).toBe("Root");
    expect(result.guide.sourceProvenance[0]?.title).toBe("The Way of Hermes");
  });

  it("rejects empty source provenance before generating a guide", async () => {
    await expect(
      generateHumanGuide({
        chart,
        brand: BRANDS.jupiterseek,
        sourceProvenance: []
      })
    ).rejects.toThrow();
  });
});
