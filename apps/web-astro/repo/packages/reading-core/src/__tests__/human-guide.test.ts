import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NatalChart } from "@astro/astro-core";
import { BRANDS } from "@astro/brands";
import { generateHumanGuide, sourceConcepts } from "../human-guide";
import { HumanGuideSchema } from "../human-guide-schema";
import { evaluateHumanGuideQuality } from "../human-guide-quality";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/human-guide.jupiterseek.golden.json"
);

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

const sourceProvenance = [
  {
    title: "The Way of Hermes",
    source:
      "/data/runtipi/media/data/web-astro/Esoteric/_OceanofPDF.com_The_Way_of_Hermes_New_Translations_of_The_Corpus_Hermeticum_and_The_Definitions_of_Hermes_Trismegistus_to_Asclepius_-_Clement_Salaman.pdf",
    tags: ["source:hermetic"],
    sections: ["metaFrame", "internalMap"]
  }
];

const goldenSourceProvenance = [
  {
    title: "The Way of Hermes",
    source:
      "/data/runtipi/media/data/web-astro/Esoteric/_OceanofPDF.com_The_Way_of_Hermes_New_Translations_of_The_Corpus_Hermeticum_and_The_Definitions_of_Hermes_Trismegistus_to_Asclepius_-_Clement_Salaman.pdf",
    tags: ["source:hermetic", "source:perennial"],
    sections: ["correspondence", "inner practice"]
  },
  {
    title: "Plotinus Enneads",
    source: "/data/runtipi/media/data/web-astro/Esoteric/Plotinus-–-Enneads.pdf",
    tags: ["source:perennial", "source:contemplative"],
    sections: ["participation", "inner ascent"]
  },
  {
    title: "The Symbolism of the Cross",
    source: "/data/runtipi/media/data/web-astro/Esoteric/_OceanofPDF.com_The_Symbolism_of_the_Cross_-_Rene_Guenon.pdf",
    tags: ["source:perennial", "source:contemplative"],
    sections: ["axis", "correspondence", "embodiment", "vibration"]
  }
];

const stableJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateHumanGuide", () => {
  it("returns schema-valid fallback with internal map and provenance", async () => {
    const result = await generateHumanGuide({
      chart,
      brand: BRANDS.jupiterseek,
      sourceProvenance
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

  it("preserves fallback metadata when returning a cached guide", async () => {
    const store = new Map<string, string>();
    const cache = {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => {
        store.set(key, value);
      }
    };

    const generated = await generateHumanGuide({
      chart,
      brand: BRANDS.jupiterseek,
      sourceProvenance,
      cache
    });
    const cached = await generateHumanGuide({
      chart,
      brand: BRANDS.jupiterseek,
      sourceProvenance,
      cache
    });

    expect(generated.meta.usedFallback).toBe(true);
    expect(cached.meta.cached).toBe(true);
    expect(cached.meta.usedFallback).toBe(true);
  });

  it("overwrites cached guide provenance with supplied provenance", async () => {
    const seeded = await generateHumanGuide({
      chart,
      brand: BRANDS.jupiterseek,
      sourceProvenance
    });
    const cache = {
      get: async () =>
        JSON.stringify({
          ...seeded.guide,
          sourceProvenance: [
            {
              title: "Invented Source",
              source: "invented.pdf",
              tags: ["source:invented"],
              sections: ["metaFrame"]
            }
          ]
        }),
      set: async () => {}
    };

    const result = await generateHumanGuide({
      chart,
      brand: BRANDS.jupiterseek,
      sourceProvenance,
      cache
    });

    expect(result.guide.sourceProvenance).toEqual(sourceProvenance);
  });

  it("grounds fallback guide nodes and sections for sparse charts", async () => {
    const sparseChart: NatalChart = {
      points: [{ key: "Sun", type: "planet", degree: 120, sign: "Leo", signDegree: 0 }],
      aspects: [],
      meta: {
        timeUnknown: true,
        timezone: "UTC",
        calculatedAt: "2026-01-01T00:00:00.000Z",
        calculationConfidence: "canonical"
      }
    };

    const result = await generateHumanGuide({
      chart: sparseChart,
      brand: BRANDS.jupiterseek,
      sourceProvenance
    });
    const nodes = [
      result.guide.internalMap.root,
      result.guide.internalMap.heartChamber,
      result.guide.internalMap.voiceAndMind,
      result.guide.internalMap.crownAndStar,
      result.guide.internalMap.shadowGate,
      result.guide.internalMap.serviceGate,
      result.guide.internalMap.inspirationGate
    ];

    expect(result.guide.overview.every((section) => section.chartBasis.length > 0)).toBe(true);
    expect(result.guide.practices.every((section) => section.chartBasis.length > 0)).toBe(true);
    expect(nodes.every((node) => node.chartBasis.length > 0)).toBe(true);
    expect(result.quality.passed).toBe(true);
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

  it("rejects blank source provenance before generating a guide", async () => {
    await expect(
      generateHumanGuide({
        chart,
        brand: BRANDS.jupiterseek,
        sourceProvenance: [
          {
            title: " ",
            source: "\t",
            tags: ["source:blank"],
            sections: ["metaFrame"]
          }
        ]
      })
    ).rejects.toThrow();
  });

  it("assembles source concepts only from source provenance metadata", () => {
    expect(sourceConcepts(goldenSourceProvenance)).toEqual([
      "correspondence between visible pattern and invisible life",
      "attention as the doorway where love becomes practical",
      "participation in a larger order rather than isolated selfhood",
      "the crossing of vertical inspiration with horizontal action",
      "vibration tested by whether it becomes kinder, clearer, and more useful"
    ]);
    expect(
      sourceConcepts([
        {
          title: "Plain Source",
          source: "/data/runtipi/media/data/web-astro/Esoteric/plain.pdf",
          tags: [],
          sections: []
        }
      ])
    ).not.toContain("vibration tested by whether it becomes kinder, clearer, and more useful");
  });

  it("matches the JupiterSeek golden sample; set WRITE_HUMAN_GUIDE_FIXTURE=1 to refresh", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_BASE_URL", "");
    vi.stubEnv("LLM_BASE_URL", "");

    const result = await generateHumanGuide({
      chart,
      brand: BRANDS.jupiterseek,
      sourceProvenance: goldenSourceProvenance
    });

    const parsed = HumanGuideSchema.parse(result.guide);
    const quality = evaluateHumanGuideQuality(parsed, chart);
    const golden = {
      guide: parsed,
      quality,
      meta: result.meta
    };

    expect(quality.passed).toBe(true);
    expect(parsed.metaFrame.tone).toEqual(
      expect.arrayContaining(["non-doctrinal", "hermetic", "practical", "loving", "direct-inspiration"])
    );
    expect(parsed.metaFrame.orientation).toContain("correspondence");
    expect(parsed.overview.map((section) => section.body).join(" ")).toContain("more awake inside it");
    expect(parsed.internalMap.root.guide).toContain("ground-wire of the map");
    expect(parsed.internalMap.shadowGate.guide).toContain("pressure chamber, not the enemy");
    expect(parsed.internalMap.inspirationGate.guide).toContain("vibration be tested by embodiment");
    expect(parsed.internalMap.root.guide).not.toBe(parsed.internalMap.heartChamber.guide);
    expect(parsed.internalMap.shadowGate.guide).toContain("forgiveness as the heat");
    expect(parsed.practices.map((section) => section.body).join(" ")).toContain("practical altar");
    expect(parsed.sourceProvenance).toEqual(goldenSourceProvenance);

    if (process.env.WRITE_HUMAN_GUIDE_FIXTURE === "1") {
      await mkdir(path.dirname(fixturePath), { recursive: true });
      await writeFile(fixturePath, stableJson(golden));
    }

    const expected = await readFile(fixturePath, "utf8");
    expect(stableJson(golden)).toBe(expected);
  });
});
