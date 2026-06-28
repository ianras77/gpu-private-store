# Human Guide Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working Phase 1-3 foundation: trustworthy chart metadata, deterministic chart intelligence, and a local-corpus-grounded Human Guide schema/generator.

**Architecture:** Keep astronomy calculation, deterministic symbolic analysis, and prose generation separate. Extend `@astro/astro-core` for richer chart facts, add `@astro/chart-analysis` for deterministic internal-map diagnostics, and extend `@astro/reading-core` plus the API for Human Guide generation with source provenance. Execute this plan as a refinement loop: each task must leave the system more functional, more specific to the chart, and more alive in tone before moving forward.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Zod, Fastify, Swiss Ephemeris adapter, existing OpenAI-compatible LLM client, existing esoterica retrieval.

---

## Refinement Loop

Every task follows this loop before commit:

1. **Function:** the code path works, validates structured data, and has focused tests.
2. **Specificity:** outputs name concrete chart facts, house/sign/angle/aspect evidence, and source provenance instead of generic spiritual language.
3. **Resonance:** Human Guide output reads as a thoughtful internal map: non-doctrinal, Hermetic in grammar, direct-inspiration oriented, practical, loving, and not fear-based.
4. **Sharpening:** if a downstream sample feels mechanical, vague, or doctrinal, revise the upstream deterministic analysis or schema first instead of hiding the weakness in prose.
5. **Evidence:** each commit includes either passing tests or a saved/readable sample fixture proving the step improved the living guide.

The implementation should loop through Tasks 1-5 as needed. If Task 4 reveals that Task 3's internal-map assignments are too thin, go back and enrich Task 3. If Task 5 reveals source retrieval is too broad or too occult-heavy, go back and sharpen source tags and policy. The goal is not merely completion; it is a foundation that can keep becoming wonderful without becoming mushy.

## File Structure

- Modify `repo/tsconfig.base.json`: add `@astro/chart-analysis` path alias.
- Create `repo/packages/chart-analysis/package.json`: workspace package manifest.
- Create `repo/packages/chart-analysis/tsconfig.json` and `repo/packages/chart-analysis/tsconfig.build.json`: TypeScript configs matching existing packages.
- Create `repo/packages/chart-analysis/src/types.ts`: deterministic analysis output types.
- Create `repo/packages/chart-analysis/src/internal-map.ts`: chart-to-map node/path assignment.
- Create `repo/packages/chart-analysis/src/analysis.ts`: top-level `analyzeChart` function.
- Create `repo/packages/chart-analysis/src/index.ts`: package exports.
- Create `repo/packages/chart-analysis/src/__tests__/analysis.test.ts`: unit tests for deterministic analysis.
- Modify `repo/packages/astro-core/src/types.ts`: add richer metadata, `Desc`, `IC`, optional speed and calculation confidence.
- Modify `repo/packages/astro-core/src/schema.ts`: validate richer chart metadata.
- Modify `repo/packages/astro-core/src/__tests__/schema.test.ts`: prove expanded chart contract.
- Modify `repo/packages/astro-engine-astro/src/index.ts`: emit expanded metadata, `Desc`, `IC`, and calculation confidence.
- Modify `repo/packages/astro-engine-swiss/src/index.ts`: emit expanded metadata, `Desc`, `IC`, point speeds, and calculation confidence.
- Modify `repo/packages/astro-engine-swiss/src/__tests__/engine.test.ts`: prove expanded Swiss output when bindings are present.
- Modify `repo/packages/reading-core/package.json`: add dependency on `@astro/chart-analysis`.
- Create `repo/packages/reading-core/src/human-guide-schema.ts`: Zod schema for Human Guide.
- Create `repo/packages/reading-core/src/human-guide.ts`: Human Guide prompt, fallback, validation, and generation.
- Create `repo/packages/reading-core/src/human-guide-quality.ts`: deterministic quality checks for chart specificity, source grounding, non-doctrinal tone, and practical counsel.
- Modify `repo/packages/reading-core/src/index.ts`: export Human Guide APIs.
- Create `repo/packages/reading-core/src/__tests__/human-guide.test.ts`: schema/fallback tests.
- Modify `repo/apps/api/package.json`: add dependency on `@astro/chart-analysis`.
- Modify `repo/apps/api/src/lib/esoterica-taxonomy.ts`: add source-family tags for Hermetic, astrology, contemplative, human-design, myth, excluded-occult.
- Modify `repo/apps/api/src/lib/esoterica.ts`: support source policy filtering and source provenance.
- Modify `repo/apps/api/src/lib/validators.ts`: add `HumanGuideRequestInput`.
- Create `repo/apps/api/src/routes/human-guide.ts`: `POST /v1/human-guide/natal`.
- Modify `repo/apps/api/src/server.ts`: register the Human Guide route.
- Create `repo/apps/api/src/routes/__tests__/human-guide.integration.test.ts`: route-level fallback test with mocked LLM/retrieval where possible.

## Task 1: Expand Chart Contract

**Files:**
- Modify: `repo/packages/astro-core/src/types.ts`
- Modify: `repo/packages/astro-core/src/schema.ts`
- Modify: `repo/packages/astro-core/src/__tests__/schema.test.ts`

- [ ] **Step 1: Write failing schema test**

Add this test to `repo/packages/astro-core/src/__tests__/schema.test.ts`:

```ts
it("validates expanded chart metadata, angles, and point speed", () => {
  const expanded = {
    points: [
      {
        key: "Sun",
        type: "planet",
        degree: 120,
        sign: "Leo",
        signDegree: 0,
        house: 5,
        speed: 0.95
      },
      {
        key: "Desc",
        type: "angle",
        degree: 210,
        sign: "Scorpio",
        signDegree: 0
      },
      {
        key: "IC",
        type: "angle",
        degree: 30,
        sign: "Taurus",
        signDegree: 0
      }
    ],
    aspects: [
      {
        type: "trine",
        between: ["Sun", "Moon"],
        orb: 2,
        exact: 120
      }
    ],
    houses: {
      system: "placidus",
      cusps: Array.from({ length: 12 }, (_, i) => i * 30),
      ascendant: 30,
      descendant: 210,
      midheaven: 120,
      imumCoeli: 300
    },
    meta: {
      timeUnknown: false,
      timezone: "UTC",
      calculatedAt: new Date().toISOString(),
      houseSystem: "placidus",
      engineId: "swiss-ephemeris",
      engineVersion: "0.1.0",
      ephemerisSource: "swiss-de441",
      calculationConfidence: "canonical",
      zodiacMode: "tropical",
      timezoneSource: "request"
    }
  };

  expect(() => NatalChartSchema.parse(expanded)).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @astro/astro-core test -- schema.test.ts`

Expected before implementation: FAIL because `descendant`, `imumCoeli`, `speed`, and expanded `meta` fields are not in the schema.

- [ ] **Step 3: Extend core types**

Update `repo/packages/astro-core/src/types.ts` with these definitions:

```ts
export const ANGLES = ["Asc", "MC", "Desc", "IC"] as const;
export type Angle = (typeof ANGLES)[number];

export type CalculationConfidence = "canonical" | "approximate" | "degraded";
export type ZodiacMode = "tropical";
export type TimezoneSource = "request" | "resolved" | "fallback";

export interface HouseInfo {
  system: HouseSystem;
  cusps: number[];
  ascendant?: number;
  descendant?: number;
  midheaven?: number;
  imumCoeli?: number;
}

export interface ChartPoint {
  key: string;
  type: ChartPointType;
  degree: number;
  sign: ZodiacSign;
  signDegree: number;
  house?: number;
  retrograde?: boolean;
  speed?: number;
}

export interface NatalChart {
  points: ChartPoint[];
  aspects: Aspect[];
  houses?: HouseInfo;
  meta: {
    timeUnknown: boolean;
    timezone: string;
    calculatedAt: string;
    birthMomentUtc?: string;
    julianDay?: number;
    houseSystem?: HouseSystem;
    engineId?: string;
    engineVersion?: string;
    ephemerisSource?: string;
    calculationConfidence?: CalculationConfidence;
    zodiacMode?: ZodiacMode;
    timezoneSource?: TimezoneSource;
  };
}
```

- [ ] **Step 4: Extend Zod schema**

Update `repo/packages/astro-core/src/schema.ts` so `ChartPointSchema`, `HouseInfoSchema`, and meta validate the new fields:

```ts
export const ChartPointSchema = z.object({
  key: z.string(),
  type: z.enum(["planet", "angle", "point"]),
  degree: z.number(),
  sign: z.string(),
  signDegree: z.number(),
  house: z.number().int().min(1).max(12).optional(),
  retrograde: z.boolean().optional(),
  speed: z.number().optional()
});

export const HouseInfoSchema = z.object({
  system: z.enum(["placidus", "whole-sign"]),
  cusps: z.array(z.number()).length(12),
  ascendant: z.number().optional(),
  descendant: z.number().optional(),
  midheaven: z.number().optional(),
  imumCoeli: z.number().optional()
});

export const NatalChartSchema = z.object({
  points: z.array(ChartPointSchema),
  aspects: z.array(AspectSchema),
  houses: HouseInfoSchema.optional(),
  meta: z.object({
    timeUnknown: z.boolean(),
    timezone: z.string(),
    calculatedAt: z.string(),
    birthMomentUtc: z.string().optional(),
    julianDay: z.number().optional(),
    houseSystem: z.enum(["placidus", "whole-sign"]).optional(),
    engineId: z.string().optional(),
    engineVersion: z.string().optional(),
    ephemerisSource: z.string().optional(),
    calculationConfidence: z.enum(["canonical", "approximate", "degraded"]).optional(),
    zodiacMode: z.enum(["tropical"]).optional(),
    timezoneSource: z.enum(["request", "resolved", "fallback"]).optional()
  })
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @astro/astro-core test -- schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add repo/packages/astro-core/src/types.ts repo/packages/astro-core/src/schema.ts repo/packages/astro-core/src/__tests__/schema.test.ts
git commit -m "Expand natal chart contract"
```

## Task 2: Emit Canonical Calculation Metadata And Angles

**Files:**
- Modify: `repo/packages/astro-engine-astro/src/index.ts`
- Modify: `repo/packages/astro-engine-swiss/src/index.ts`
- Modify: `repo/packages/astro-engine-swiss/src/__tests__/engine.test.ts`

- [ ] **Step 1: Write failing Swiss engine test**

Add to `repo/packages/astro-engine-swiss/src/__tests__/engine.test.ts`:

```ts
it("emits canonical metadata and all four angles", async () => {
  const engine = createSwissEngine();
  const chart = await engine.calculateChart(BASE_INPUT);

  expect(chart.meta.engineId).toBe("swiss-ephemeris");
  expect(chart.meta.calculationConfidence).toBe("canonical");
  expect(chart.meta.zodiacMode).toBe("tropical");
  expect(chart.houses?.descendant).toBeDefined();
  expect(chart.houses?.imumCoeli).toBeDefined();
  expect(chart.points.find((point) => point.key === "Desc")).toBeDefined();
  expect(chart.points.find((point) => point.key === "IC")).toBeDefined();
  expect(chart.points.find((point) => point.key === "Sun")?.speed).toEqual(expect.any(Number));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @astro/astro-engine-swiss test -- engine.test.ts`

Expected before implementation: FAIL when Swiss bindings are installed; SKIP is acceptable when native bindings are unavailable.

- [ ] **Step 3: Update Swiss point building**

In `repo/packages/astro-engine-swiss/src/index.ts`, change `buildPoint` and call sites to preserve speed:

```ts
const buildPoint = (
  key: string,
  type: ChartPoint["type"],
  degree: number,
  retrograde?: boolean,
  speed?: number
): ChartPoint => {
  const normalized = normalizeDegree(degree);
  return {
    key,
    type,
    degree: normalized,
    sign: degreeToSign(normalized),
    signDegree: degreeToSignDegree(normalized),
    retrograde,
    speed
  };
};
```

When adding bodies, call:

```ts
points.push(buildPoint(body.key, "planet", result.degree, result.retrograde, result.speed));
```

Update `calcBody` return type to include speed:

```ts
const calcBody = (swiss: SwissEphemeris, jd: number, body: BodyDef): { degree: number; retrograde: boolean; speed: number } => {
  const bodyId = bodyIdFromDef(swiss, body);
  const flags = [swiss.SEFLG_SWIEPH | swiss.SEFLG_SPEED, swiss.SEFLG_MOSEPH | swiss.SEFLG_SPEED];
  let lastError = "";

  for (const flag of flags) {
    const result = swiss.swe_calc_ut(jd, bodyId, flag);
    if (isErrorResult(result)) {
      lastError = result.error;
      continue;
    }
    const lon = asLongitudeResult(result);
    if (!lon) {
      lastError = "Swiss returned a non-ecliptic coordinate payload.";
      continue;
    }
    return {
      degree: normalizeDegree(lon.longitude),
      retrograde: lon.longitudeSpeed < 0,
      speed: lon.longitudeSpeed
    };
  }

  throw new Error(`Swiss Ephemeris failed for ${body.key}: ${lastError || "Unknown error"}`);
};
```

- [ ] **Step 4: Add Desc/IC and metadata in Swiss engine**

After `asc` and `mc` are calculated:

```ts
const desc = normalizeDegree(asc + 180);
const ic = normalizeDegree(mc + 180);
```

Ensure `mapPlacidusHouses` returns:

```ts
return {
  system: "placidus",
  cusps: rawCusps.slice(0, 12).map((cusp) => normalizeDegree(cusp)),
  ascendant: normalizeDegree(asc),
  descendant: normalizeDegree(asc + 180),
  midheaven: normalizeDegree(mc),
  imumCoeli: normalizeDegree(mc + 180)
};
```

Add angle points:

```ts
points.push(buildPoint("Asc", "angle", asc));
points.push(buildPoint("MC", "angle", mc));
points.push(buildPoint("Desc", "angle", desc));
points.push(buildPoint("IC", "angle", ic));
```

Set metadata:

```ts
meta: {
  timeUnknown,
  timezone: input.timezone,
  calculatedAt: new Date().toISOString(),
  birthMomentUtc: dateUTC.toISOString(),
  julianDay: Number(jd.toFixed(8)),
  houseSystem: timeUnknown ? undefined : houseSystem,
  engineId: this.id,
  engineVersion: "0.1.0",
  ephemerisSource: "swiss-ephemeris",
  calculationConfidence: "canonical",
  zodiacMode: "tropical",
  timezoneSource: "request"
}
```

- [ ] **Step 5: Update approximate engine metadata and angles**

In `repo/packages/astro-engine-astro/src/index.ts`, add `Desc`, `IC`, and approximate metadata with `calculationConfidence: "approximate"` and `ephemerisSource: "mean-period-dev-engine"`.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @astro/astro-core test
pnpm --filter @astro/astro-engine-swiss test -- engine.test.ts
```

Expected: astro-core PASS. Swiss PASS when bindings are available, SKIP when unavailable.

- [ ] **Step 7: Commit**

```bash
git add repo/packages/astro-engine-astro/src/index.ts repo/packages/astro-engine-swiss/src/index.ts repo/packages/astro-engine-swiss/src/__tests__/engine.test.ts
git commit -m "Emit chart calculation provenance"
```

## Task 3: Add Chart Analysis Package

**Files:**
- Modify: `repo/tsconfig.base.json`
- Create: `repo/packages/chart-analysis/package.json`
- Create: `repo/packages/chart-analysis/tsconfig.json`
- Create: `repo/packages/chart-analysis/tsconfig.build.json`
- Create: `repo/packages/chart-analysis/src/types.ts`
- Create: `repo/packages/chart-analysis/src/internal-map.ts`
- Create: `repo/packages/chart-analysis/src/analysis.ts`
- Create: `repo/packages/chart-analysis/src/index.ts`
- Create: `repo/packages/chart-analysis/src/__tests__/analysis.test.ts`

- [ ] **Step 1: Write failing analysis test**

Create `repo/packages/chart-analysis/src/__tests__/analysis.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @astro/chart-analysis test`

Expected before implementation: FAIL because package does not exist.

- [ ] **Step 3: Add workspace alias**

In `repo/tsconfig.base.json`, add:

```json
"@astro/chart-analysis": ["packages/chart-analysis/src"]
```

- [ ] **Step 4: Create package files**

Create `repo/packages/chart-analysis/package.json`:

```json
{
  "name": "@astro/chart-analysis",
  "version": "0.1.0",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "echo 'lint not configured'",
    "test": "vitest --run --config ../../vitest.config.ts"
  },
  "dependencies": {
    "@astro/astro-core": "workspace:*"
  }
}
```

Create `repo/packages/chart-analysis/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
```

Create `repo/packages/chart-analysis/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist"
  },
  "exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]
}
```

- [ ] **Step 5: Implement analysis types**

Create `repo/packages/chart-analysis/src/types.ts`:

```ts
export interface AnalysisBasis {
  chartBasis: string[];
  sourceBasis: string[];
}

export interface MapNode extends AnalysisBasis {
  name: string;
  theme: string;
  gift: string;
  distortion: string;
  practice: string;
  mantra: string;
}

export interface MapPath extends AnalysisBasis {
  from: string;
  to: string;
  tension: string;
  medicine: string;
  practice: string;
}

export interface ChartAnalysis {
  version: "0.1.0";
  correspondences: AnalysisBasis[];
  developmentalTasks: AnalysisBasis[];
  integrationTensions: AnalysisBasis[];
  graceChannels: AnalysisBasis[];
  practiceNeeds: AnalysisBasis[];
  directInspirationStyle: AnalysisBasis;
  allegoryAssignments: Record<string, AnalysisBasis>;
  ageTransitionSignatures: AnalysisBasis[];
  internalMap: {
    root: MapNode;
    bodyTemple: MapNode;
    heartChamber: MapNode;
    voiceAndMind: MapNode;
    crownAndStar: MapNode;
    shadowGate: MapNode;
    serviceGate: MapNode;
    inspirationGate: MapNode;
    paths: MapPath[];
  };
}
```

- [ ] **Step 6: Implement map assignment and top-level analysis**

Create `repo/packages/chart-analysis/src/internal-map.ts` and `repo/packages/chart-analysis/src/analysis.ts` with deterministic helpers. Use exact placement strings like:

```ts
const placement = (point: ChartPoint): string => {
  const house = point.house ? `, House ${point.house}` : "";
  return `${point.key} in ${point.sign}${house}`;
};
```

Assign:

- Moon and IC/4th house to `root`.
- Venus and 5th/7th house to `heartChamber`.
- Mercury, Uranus, 3rd/9th house to `voiceAndMind` and `inspirationGate`.
- Sun, chart ruler, MC/10th house to `crownAndStar` and `serviceGate`.
- Saturn, Mars, South Node, hard aspects, 8th/12th house to `shadowGate`.
- Aspects to `paths`.

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @astro/chart-analysis test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add repo/tsconfig.base.json repo/packages/chart-analysis
git commit -m "Add deterministic chart analysis"
```

## Task 4: Add Human Guide Schema And Generator

**Files:**
- Modify: `repo/packages/reading-core/package.json`
- Create: `repo/packages/reading-core/src/human-guide-schema.ts`
- Create: `repo/packages/reading-core/src/human-guide.ts`
- Create: `repo/packages/reading-core/src/human-guide-quality.ts`
- Modify: `repo/packages/reading-core/src/index.ts`
- Create: `repo/packages/reading-core/src/__tests__/human-guide.test.ts`

- [ ] **Step 1: Write failing Human Guide test**

Create `repo/packages/reading-core/src/__tests__/human-guide.test.ts`:

```ts
import fs from "node:fs";
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @astro/reading-core test -- human-guide.test.ts`

Expected before implementation: FAIL because files do not exist.

- [ ] **Step 3: Add dependency**

In `repo/packages/reading-core/package.json`, add:

```json
"@astro/chart-analysis": "workspace:*"
```

- [ ] **Step 4: Create Human Guide schema**

Create `repo/packages/reading-core/src/human-guide-schema.ts` with Zod schemas for `SourceUse`, `GuideSection`, `MapNode`, `MapPath`, and `HumanGuideSchema`. Require:

- `metaFrame.world` equals `"living-cosmos"`.
- `sourceProvenance` is an array.
- `internalMap.root`, `heartChamber`, `voiceAndMind`, `crownAndStar`, `shadowGate`, `serviceGate`, and `inspirationGate`.
- `disclaimer`.

End the file with:

```ts
export type HumanGuide = z.infer<typeof HumanGuideSchema>;
export type SourceUse = z.infer<typeof SourceUseSchema>;
```

- [ ] **Step 5: Create Human Guide quality evaluator**

Create `repo/packages/reading-core/src/human-guide-quality.ts`:

```ts
import type { NatalChart } from "@astro/astro-core";
import { HumanGuideSchema, type HumanGuide } from "./human-guide-schema";

export type QualityCheck = {
  passed: boolean;
  evidence: string[];
  failures: string[];
};

export type HumanGuideQuality = {
  passed: boolean;
  checks: {
    schema: QualityCheck;
    chartSpecificity: QualityCheck;
    sourceGrounding: QualityCheck;
    nonDoctrinalTone: QualityCheck;
    practicalCounsel: QualityCheck;
  };
};

const textOf = (guide: HumanGuide): string => JSON.stringify(guide).toLowerCase();

const chartTokens = (chart: NatalChart): string[] =>
  chart.points.flatMap((point) => [
    point.key.toLowerCase(),
    point.sign.toLowerCase(),
    point.house ? `house ${point.house}` : ""
  ]).filter(Boolean);

const check = (passed: boolean, evidence: string[], failure: string): QualityCheck => ({
  passed,
  evidence,
  failures: passed ? [] : [failure]
});

export const evaluateHumanGuideQuality = (guide: HumanGuide, chart: NatalChart): HumanGuideQuality => {
  const parsed = HumanGuideSchema.safeParse(guide);
  const text = textOf(guide);
  const tokens = chartTokens(chart);
  const matchedTokens = tokens.filter((token) => text.includes(token));
  const forbidden = ["pope", "church authority", "only true", "damned", "curse", "must obey"];
  const practicalWords = ["practice", "notice", "choose", "return", "ask", "serve", "forgive"];

  const checks = {
    schema: check(parsed.success, ["HumanGuideSchema"], "Guide does not match HumanGuideSchema."),
    chartSpecificity: check(
      matchedTokens.length >= 6,
      matchedTokens.slice(0, 12),
      "Guide does not name enough concrete chart facts."
    ),
    sourceGrounding: check(
      guide.sourceProvenance.length > 0,
      guide.sourceProvenance.map((source) => source.title),
      "Guide has no source provenance."
    ),
    nonDoctrinalTone: check(
      forbidden.every((term) => !text.includes(term)),
      ["No institutional or coercive authority language detected."],
      "Guide contains doctrinal or coercive language."
    ),
    practicalCounsel: check(
      practicalWords.some((word) => text.includes(word)),
      practicalWords.filter((word) => text.includes(word)),
      "Guide lacks practical counsel language."
    )
  };

  return {
    passed: Object.values(checks).every((qualityCheck) => qualityCheck.passed),
    checks
  };
};
```

- [ ] **Step 6: Create Human Guide generator**

Create `repo/packages/reading-core/src/human-guide.ts`:

- Accept `{ chart, brand, sourceProvenance, loreContext?, cache? }`.
- Run `analyzeChart(chart)`.
- Build a Human Guide prompt that says Hermetic source grammar, Jesus as wisdom teacher, non-doctrinal, no fear, no institutional authority, no uncited source claims.
- Call existing `callLLM`.
- Parse with `HumanGuideSchema`.
- If parse fails or LLM unavailable, return a deterministic fallback built from `ChartAnalysis`.
- Run `evaluateHumanGuideQuality(guide, chart)` and return `{ guide, analysis, quality }`.
- If `quality.passed` is false for deterministic fallback, revise the fallback text inside the same task until quality passes without weakening the schema.

- [ ] **Step 7: Export APIs**

Add to `repo/packages/reading-core/src/index.ts`:

```ts
export * from "./human-guide";
export * from "./human-guide-schema";
export * from "./human-guide-quality";
```

- [ ] **Step 8: Run tests**

Run: `pnpm --filter @astro/reading-core test -- human-guide.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add repo/packages/reading-core/package.json repo/packages/reading-core/src/human-guide-schema.ts repo/packages/reading-core/src/human-guide.ts repo/packages/reading-core/src/human-guide-quality.ts repo/packages/reading-core/src/index.ts repo/packages/reading-core/src/__tests__/human-guide.test.ts
git commit -m "Add human guide generation"
```

## Task 5: Add Source Policy And Human Guide API Route

**Files:**
- Modify: `repo/apps/api/package.json`
- Modify: `repo/apps/api/src/lib/esoterica-taxonomy.ts`
- Modify: `repo/apps/api/src/lib/esoterica.ts`
- Modify: `repo/apps/api/src/lib/validators.ts`
- Create: `repo/apps/api/src/routes/human-guide.ts`
- Modify: `repo/apps/api/src/server.ts`

- [ ] **Step 1: Add API dependency**

In `repo/apps/api/package.json`, add:

```json
"@astro/chart-analysis": "workspace:*"
```

- [ ] **Step 2: Add source-family tags**

In `repo/apps/api/src/lib/esoterica-taxonomy.ts`, add tag keyword groups:

```ts
export const SOURCE_FAMILY_TAGS: LoreTag[] = [
  { id: "source:hermetic", keywords: ["hermes", "hermetic", "trismegistus", "microcosm", "macrocosm"] },
  { id: "source:astrology", keywords: ["astrology", "zodiac", "birth chart", "house", "planet", "aspect"] },
  { id: "source:contemplative", keywords: ["meditation", "forgiveness", "wisdom", "contemplation", "prayer"] },
  { id: "source:human-design", keywords: ["human design", "bodygraph", "authority", "profile", "centers"] },
  { id: "source:myth", keywords: ["myth", "goddess", "hero", "underworld", "oracle"] },
  { id: "source:excluded-occult", keywords: ["necromancer", "curse", "sworn book", "abramelin", "galdrabok"] }
];
```

Include these in `inferTags`.

- [ ] **Step 3: Add retrieval policy**

In `repo/apps/api/src/lib/esoterica.ts`, add:

```ts
export type SourcePolicy = {
  includeTags: string[];
  excludeTags: string[];
};

export const HUMAN_GUIDE_SOURCE_POLICY: SourcePolicy = {
  includeTags: [
    "source:hermetic",
    "source:astrology",
    "source:contemplative",
    "source:human-design",
    "source:myth"
  ],
  excludeTags: ["source:excluded-occult"]
};
```

Filter retrieved chunks after search:

```ts
const applySourcePolicy = (chunks: EsotericaChunk[], policy?: SourcePolicy): EsotericaChunk[] => {
  if (!policy) return chunks;
  return chunks.filter((chunk) => {
    const tags = chunk.tags ?? [];
    if (tags.some((tag) => policy.excludeTags.includes(tag))) return false;
    return policy.includeTags.length === 0 || tags.some((tag) => policy.includeTags.includes(tag));
  });
};
```

- [ ] **Step 4: Add validator**

In `repo/apps/api/src/lib/validators.ts`, add:

```ts
export const HumanGuideRequestInput = z.object({
  chartJson: z.unknown(),
  brandId: BrandIdSchema,
  chartProfileId: z.string().uuid().optional(),
  saveToFeed: z.boolean().optional(),
  preferences: z
    .object({
      focus: z.string().optional()
    })
    .optional()
});
```

- [ ] **Step 5: Create route**

Create `repo/apps/api/src/routes/human-guide.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { NatalChartSchema } from "@astro/astro-core";
import { BRANDS } from "@astro/brands";
import { generateHumanGuide } from "@astro/reading-core";
import { HumanGuideRequestInput } from "../lib/validators";
import {
  HUMAN_GUIDE_SOURCE_POLICY,
  buildLoreQuery,
  retrieveEsotericaLore,
  renderLoreContext
} from "../lib/esoterica";
import { ApiError, sendApiError } from "../lib/http-errors";
import { enforceRateLimit } from "../lib/rate-limit";

export const humanGuideRoutes = async (app: FastifyInstance) => {
  app.post("/natal", async (request, reply) => {
    const limited = await enforceRateLimit({
      request,
      reply,
      scope: "human-guide",
      max: Number(process.env.HUMAN_GUIDE_RATE_LIMIT_MAX ?? 10),
      windowMs: Number(process.env.HUMAN_GUIDE_RATE_LIMIT_WINDOW_MS ?? 60_000)
    });
    if (limited) return limited;

    const parsed = HumanGuideRequestInput.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid human guide payload.", {
          statusCode: 400,
          issues: parsed.error.issues
        }),
        request.log
      );
    }

    request.brandId = parsed.data.brandId;
    const brand = BRANDS[parsed.data.brandId];
    const chartValidation = NatalChartSchema.safeParse(parsed.data.chartJson);
    if (!chartValidation.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid chart payload.", {
          statusCode: 400,
          issues: chartValidation.error.issues
        }),
        request.log
      );
    }

    const chart = chartValidation.data;
    const query = buildLoreQuery(chart, brand);
    const chunks = await retrieveEsotericaLore(query, 8, undefined, HUMAN_GUIDE_SOURCE_POLICY);
    const loreContext = renderLoreContext(chunks);
    const sourceProvenance = chunks.map((chunk) => ({
      title: chunk.title ?? "Untitled source",
      source: chunk.source,
      tags: chunk.tags ?? [],
      sections: ["metaFrame", "internalMap", "practicalCounsel"]
    }));

    const result = await generateHumanGuide({
      chart,
      brand,
      loreContext,
      sourceProvenance
    });

    return result;
  });
};
```

Adjust `retrieveEsotericaLore` signature to accept the optional policy:

```ts
export const retrieveEsotericaLore = async (
  query: string,
  topK = 4,
  brandTag?: string,
  sourcePolicy?: SourcePolicy
): Promise<EsotericaChunk[]> => {
  // existing retrieval
  return applySourcePolicy(results, sourcePolicy).slice(0, topK);
};
```

- [ ] **Step 6: Register route**

In `repo/apps/api/src/server.ts`, import and register:

```ts
import { humanGuideRoutes } from "./routes/human-guide";
```

```ts
app.register(humanGuideRoutes, { prefix: "/v1/human-guide" });
```

- [ ] **Step 7: Run tests/build**

Run:

```bash
pnpm --filter @astro/api test
pnpm --filter @astro/api build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add repo/apps/api/package.json repo/apps/api/src/lib/esoterica-taxonomy.ts repo/apps/api/src/lib/esoterica.ts repo/apps/api/src/lib/validators.ts repo/apps/api/src/routes/human-guide.ts repo/apps/api/src/server.ts
git commit -m "Add human guide API route"
```

## Task 6: Golden Sample Refinement

**Files:**
- Create: `repo/packages/reading-core/fixtures/human-guide-sample.json`
- Create: `repo/packages/reading-core/fixtures/human-guide-quality-report.json`
- Modify: `repo/packages/reading-core/src/__tests__/human-guide.test.ts`

- [ ] **Step 1: Add golden sample writer test**

Add a test to `repo/packages/reading-core/src/__tests__/human-guide.test.ts` that writes a deterministic sample when `WRITE_HUMAN_GUIDE_FIXTURE=1`:

```ts
it("can write a golden Human Guide sample for human review", async () => {
  if (process.env.WRITE_HUMAN_GUIDE_FIXTURE !== "1") return;

  const result = await generateHumanGuide({
    chart,
    brand: BRANDS.jupiterseek,
    sourceProvenance: [
      {
        title: "The Way of Hermes",
        source: "/data/runtipi/media/data/web-astro/Esoteric/hermes.pdf",
        tags: ["source:hermetic"],
        sections: ["metaFrame", "internalMap", "practicalCounsel"]
      }
    ]
  });

  await fs.promises.mkdir("fixtures", { recursive: true });
  await fs.promises.writeFile(
    "fixtures/human-guide-sample.json",
    `${JSON.stringify(result.guide, null, 2)}\n`
  );
  await fs.promises.writeFile(
    "fixtures/human-guide-quality-report.json",
    `${JSON.stringify(result.quality, null, 2)}\n`
  );
});
```

- [ ] **Step 2: Generate the sample**

Run: `WRITE_HUMAN_GUIDE_FIXTURE=1 pnpm --filter @astro/reading-core test -- human-guide.test.ts`

Expected: PASS and writes both fixture files.

- [ ] **Step 3: Human-read the sample**

Run:

```bash
cat repo/packages/reading-core/fixtures/human-guide-quality-report.json
cat repo/packages/reading-core/fixtures/human-guide-sample.json
```

Expected:

- Quality report has `"passed": true`.
- Sample names concrete placements and aspect evidence.
- Sample does not sound like institutional doctrine, fatalism, fortune telling, or generic wellness copy.
- Sample offers practical counsel in the voice of a living internal map.

- [ ] **Step 4: Loop if the sample is thin**

If any expectation fails, return to the smallest upstream task:

- Thin chart evidence: revise Task 3 analysis.
- Thin source grounding: revise Task 5 source policy/provenance.
- Thin voice: revise Task 4 prompt/fallback/schema.
- Calculation uncertainty: revise Task 1 or Task 2 metadata.

Repeat Steps 2-4 until the sample is both structurally valid and worth reading.

- [ ] **Step 5: Commit**

```bash
git add repo/packages/reading-core/fixtures/human-guide-sample.json repo/packages/reading-core/fixtures/human-guide-quality-report.json repo/packages/reading-core/src/__tests__/human-guide.test.ts
git commit -m "Add human guide golden sample"
```

## Task 7: Full Verification

**Files:**
- Read-only verification across changed packages.

- [ ] **Step 1: Install dependencies if missing**

Run: `test -d node_modules || pnpm install --frozen-lockfile`

Expected: existing dependencies are present, or install completes from `pnpm-lock.yaml`.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --filter @astro/astro-core test
pnpm --filter @astro/astro-engine-astro test
pnpm --filter @astro/astro-engine-swiss test
pnpm --filter @astro/chart-analysis test
pnpm --filter @astro/reading-core test
pnpm --filter @astro/api test
```

Expected: PASS, with Swiss tests skipped only if native bindings are unavailable.

- [ ] **Step 3: Run build**

Run: `pnpm run build`

Expected: PASS.

- [ ] **Step 4: Inspect staged/uncommitted work**

Run: `git status --short`

Expected: only pre-existing unrelated dirty files remain, or no dirty files from this work remain.

## Self-Review

Spec coverage:

- Phase 1 calculation truth is covered by Tasks 1, 2, and 7.
- Phase 2 chart intelligence is covered by Task 3.
- Phase 3 Human Guide schema/generation is covered by Tasks 4 and 5.
- Iterative refinement for functional, specific, and resonant output is covered by the Refinement Loop and Task 6.
- Local-source provenance and source policy are covered by Task 5.
- Human Design-like/Kabbalah-like internal map is covered by Tasks 3 and 4.
- Non-doctrinal Hermetic meta-world and voice rules are covered by Task 4 prompt/fallback and Task 5 source policy.

Placeholder scan:

- The plan contains no `TBD`, no `TODO`, and no unspecified implementation-only steps.

Type consistency:

- `MapNode`, `MapPath`, `ChartAnalysis`, `HumanGuide`, and `SourceUse` are introduced before use.
- `internalMap` in analysis corresponds to `internalMap` in the Human Guide schema.
