import type { BrandConfig } from "@astro/brands";
import type { NatalChart, ChartPoint, AspectType } from "@astro/astro-core";
import { PLANETS, shortestArc } from "@astro/astro-core";
import { hashObject } from "@astro/utils";
import { brandPrompt, systemPrompt } from "./prompt";
import { callLLM } from "./llm";
import { CompatibilityOutputSchema, type CompatibilityOutput } from "./schemas";

export type CompatibilityLength = "short" | "standard" | "deep";

export interface GenerateCompatibilityInput {
  chartA: NatalChart;
  chartB: NatalChart;
  brand: BrandConfig;
  length: CompatibilityLength;
  preferences?: {
    focus?: string;
    lore?: string;
  };
  cache?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  };
}

type SynastryAspect = {
  type: AspectType;
  a: ChartPoint;
  b: ChartPoint;
  orb: number;
  exact: number;
};

const SYNASTRY_KEYS = [...PLANETS, "Asc", "MC"] as const;

const ASPECT_DEGREES: Record<AspectType, number> = {
  conjunction: 0,
  opposition: 180,
  trine: 120,
  square: 90,
  sextile: 60
};

const DEFAULT_ORBS: Record<AspectType, number> = {
  conjunction: 8,
  opposition: 8,
  trine: 6,
  square: 6,
  sextile: 4
};

const labelPoint = (point: ChartPoint): string => {
  if (point.key === "Asc") return "Rising";
  if (point.key === "MC") return "Midheaven";
  return point.key;
};

const formatPlacement = (point?: ChartPoint): string => {
  if (!point) return "";
  const house = point.house ? `, House ${point.house}` : "";
  const retrograde = point.retrograde ? " (retrograde)" : "";
  return `${labelPoint(point)} in ${point.sign} ${point.signDegree.toFixed(1)}°${house}${retrograde}`;
};

const selectPoints = (chart: NatalChart): ChartPoint[] => {
  return chart.points.filter((point) => SYNASTRY_KEYS.includes(point.key as any));
};

const detectSynastryAspects = (
  pointsA: ChartPoint[],
  pointsB: ChartPoint[],
  orbs: Partial<Record<AspectType, number>> = {}
): SynastryAspect[] => {
  const result: SynastryAspect[] = [];
  const orbConfig = { ...DEFAULT_ORBS, ...orbs };

  for (const a of pointsA) {
    for (const b of pointsB) {
      const separation = shortestArc(a.degree, b.degree);
      for (const aspect of Object.keys(ASPECT_DEGREES) as AspectType[]) {
        const exact = ASPECT_DEGREES[aspect];
        const diff = Math.abs(separation - exact);
        const orb = orbConfig[aspect];
        if (diff <= orb) {
          result.push({
            type: aspect,
            a,
            b,
            orb: diff,
            exact
          });
          break;
        }
      }
    }
  }

  return result.sort((a, b) => a.orb - b.orb);
};

const formatAspectDetail = (aspect: SynastryAspect): string => {
  return `${labelPoint(aspect.a)} in ${aspect.a.sign} ${aspect.a.signDegree.toFixed(1)}° ${aspect.type} ${labelPoint(
    aspect.b
  )} in ${aspect.b.sign} ${aspect.b.signDegree.toFixed(1)}° (orb ${aspect.orb.toFixed(1)}°)`;
};

const formatAspectLabel = (aspect: SynastryAspect): string => {
  return `${labelPoint(aspect.a)} ${aspect.type} ${labelPoint(aspect.b)} (orb ${aspect.orb.toFixed(1)}°)`;
};

const buildPrompt = (
  chartA: NatalChart,
  chartB: NatalChart,
  brand: BrandConfig,
  length: CompatibilityLength,
  focus?: string,
  lore?: string
) => {
  const findPoint = (chart: NatalChart, key: string) => chart.points.find((p) => p.key === key);
  const aSun = findPoint(chartA, "Sun");
  const aMoon = findPoint(chartA, "Moon");
  const aRising = findPoint(chartA, "Asc");
  const bSun = findPoint(chartB, "Sun");
  const bMoon = findPoint(chartB, "Moon");
  const bRising = findPoint(chartB, "Asc");

  const pointsA = selectPoints(chartA);
  const pointsB = selectPoints(chartB);
  const synastry = detectSynastryAspects(pointsA, pointsB);
  const synastryLines = synastry.slice(0, 10).map(formatAspectDetail).join("; ");

  const keyPlacements = (chart: NatalChart) => {
    const keys = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
    return keys
      .map((key) => formatPlacement(findPoint(chart, key)))
      .filter(Boolean)
      .join("; ");
  };

  const narrativeGuidance =
    length === "short"
      ? "Narrative: 2 paragraphs, 60-90 words each."
      : length === "standard"
      ? "Narrative: 3-4 paragraphs, 80-110 words each."
      : "Narrative: 6-8 paragraphs, 90-140 words each.";

  return [
    brandPrompt(brand),
    `Length: ${length}`,
    focus ? `Relationship focus: ${focus}` : "",
    lore
      ? "Lore context (for inspiration only; paraphrase, no direct quotes longer than 10 words; do not mention sources):\n" +
        lore
      : "",
    `Person A time unknown: ${chartA.meta.timeUnknown}`,
    `Person A Big Three: ${[
      formatPlacement(aSun),
      formatPlacement(aMoon),
      chartA.meta.timeUnknown ? "" : formatPlacement(aRising)
    ]
      .filter(Boolean)
      .join(" | ")}`,
    `Person A key placements: ${keyPlacements(chartA)}`,
    `Person B time unknown: ${chartB.meta.timeUnknown}`,
    `Person B Big Three: ${[
      formatPlacement(bSun),
      formatPlacement(bMoon),
      chartB.meta.timeUnknown ? "" : formatPlacement(bRising)
    ]
      .filter(Boolean)
      .join(" | ")}`,
    `Person B key placements: ${keyPlacements(chartB)}`,
    synastryLines ? `Synastry aspects (closest first): ${synastryLines}` : "Synastry aspects: none detected.",
    "Return JSON with keys: overview, narrative, pairing, harmony, friction, growth, aspects, rituals, disclaimer.",
    "Overview should be 4-7 short lines (not bullets).",
    narrativeGuidance,
    "Pairing must include personA and personB Sun/Moon/Rising. If time is unknown for a person, omit rising and include presentation instead.",
    "Harmony and friction should each include 2-4 entries with a title and 2-4 sentences tied to synastry aspects.",
    "Aspects: 3-6 synastry highlights tied to the listed aspects.",
    "Growth should include 2-5 lines about how the relationship can mature.",
    "Rituals should be 3-6 specific, grounded practices for the two of them.",
    "Voice: intimate, mystical, clear; address the pair as 'you two' or 'the two of you'."
  ]
    .filter(Boolean)
    .join("\n");
};

const safeParse = (payload: string): CompatibilityOutput | null => {
  try {
    const data = JSON.parse(payload);
    return CompatibilityOutputSchema.parse(data);
  } catch {
    return null;
  }
};

const fallbackReading = (
  chartA: NatalChart,
  chartB: NatalChart,
  brand: BrandConfig,
  length: CompatibilityLength
): CompatibilityOutput => {
  const findPoint = (chart: NatalChart, key: string) => chart.points.find((p) => p.key === key);

  const aSun = findPoint(chartA, "Sun");
  const aMoon = findPoint(chartA, "Moon");
  const aRising = findPoint(chartA, "Asc");
  const bSun = findPoint(chartB, "Sun");
  const bMoon = findPoint(chartB, "Moon");
  const bRising = findPoint(chartB, "Asc");

  const synastry = detectSynastryAspects(selectPoints(chartA), selectPoints(chartB));
  const supportive = synastry.filter((aspect) =>
    ["trine", "sextile", "conjunction"].includes(aspect.type)
  );
  const challenging = synastry.filter((aspect) =>
    ["square", "opposition"].includes(aspect.type)
  );

  const overview = [
    `This bond is framed by ${formatPlacement(aSun)} and ${formatPlacement(bSun)}, a shared center of gravity.`,
    `Emotional rhythm moves between ${formatPlacement(aMoon)} and ${formatPlacement(bMoon)}.`,
    synastry[0]
      ? `The closest synastry signature is ${formatAspectLabel(synastry[0])}.`
      : "The synastry pattern is subtle, asking for slow discovery.",
    `Your connection wants ${brand.toneKeywords.slice(0, 2).join(" and ")}, not perfection.`,
    "Depth grows when you name the pattern and choose the ritual together.",
    "Let the relationship be a practice, not a verdict."
  ].slice(0, length === "short" ? 4 : length === "standard" ? 5 : 6);

  const narrative = [
    `You two meet in a field of distinct signatures: ${formatPlacement(aSun)} bringing one kind of light, ${formatPlacement(
      bSun
    )} bringing another. This creates a bond that is more about calibration than compromise: learning how each light changes the room.`,
    `The emotional backbone is set by ${formatPlacement(aMoon)} and ${formatPlacement(
      bMoon
    )}. When these rhythms are honored, the relationship feels safe enough to stretch. When ignored, the bond can feel loud even in silence.`,
    synastry.length
      ? `Synastry highlights like ${synastry
          .slice(0, 2)
          .map((aspect) => formatAspectLabel(aspect))
          .join(" and ")}
        act as the visible threads between your stories. These are the places where you feel each other most directly.`
      : "Even without tight synastry aspects, the relationship can grow through intentional rituals and shared timing.",
    `The deeper work is to become fluent in each other's pace. Use ${brand.focusModules
      .map((module) => module.title)
      .join(" and ")} as a shared practice: one structure, one release, one vow.`
  ].slice(0, length === "short" ? 2 : length === "standard" ? 3 : 4);

  const pairing = {
    personA: {
      sun: formatPlacement(aSun),
      moon: formatPlacement(aMoon),
      rising: chartA.meta.timeUnknown ? undefined : formatPlacement(aRising),
      presentation: chartA.meta.timeUnknown
        ? "Presentation inferred from Sun/Moon emphasis."
        : undefined
    },
    personB: {
      sun: formatPlacement(bSun),
      moon: formatPlacement(bMoon),
      rising: chartB.meta.timeUnknown ? undefined : formatPlacement(bRising),
      presentation: chartB.meta.timeUnknown
        ? "Presentation inferred from Sun/Moon emphasis."
        : undefined
    }
  };

  const harmony = (supportive.length ? supportive : synastry)
    .slice(0, 3)
    .map((aspect, index) => ({
      title: `Harmony ${index + 1}`,
      text: `${formatAspectLabel(aspect)} creates an ease that can be leaned on during stress.`
    }));
  const harmonyFallbacks = [
    {
      title: "Harmony 1",
      text: "Shared priorities show up when you choose rituals that protect the bond."
    },
    {
      title: "Harmony 2",
      text: "You two build trust fastest through consistent, low-drama actions."
    }
  ];
  while (harmony.length < 2) {
    const fallback = harmonyFallbacks[Math.min(harmony.length, harmonyFallbacks.length - 1)]!;
    harmony.push(fallback);
  }

  const friction = (challenging.length ? challenging : synastry)
    .slice(0, 3)
    .map((aspect, index) => ({
      title: `Friction ${index + 1}`,
      text: `${formatAspectLabel(aspect)} signals a tension that can become a growth edge when named.`
    }));
  const frictionFallbacks = [
    {
      title: "Friction 1",
      text: "Different pacing can feel like distance unless you name it early."
    },
    {
      title: "Friction 2",
      text: "Unspoken expectations are the quickest source of drift between you two."
    }
  ];
  while (friction.length < 2) {
    const fallback = frictionFallbacks[Math.min(friction.length, frictionFallbacks.length - 1)]!;
    friction.push(fallback);
  }

  const growth = [
    "Practice naming the moment your rhythms diverge, before it becomes a story.",
    "Translate conflict into curiosity, then into an agreement.",
    "Schedule one shared ritual that proves the relationship is a living vow.",
    "Honor the different paces: one partner leads, the other grounds."
  ].slice(0, length === "short" ? 2 : length === "standard" ? 3 : 4);

  const aspects = synastry.slice(0, 6).map((aspect) => ({
    aspect: formatAspectLabel(aspect),
    text: "This synastry link reveals the tone of exchange between you two."
  }));
  const aspectFallbacks = [
    {
      aspect: "Shared Rhythm",
      text: "You two sync most easily when you establish a consistent cadence."
    },
    {
      aspect: "Mutual Mirror",
      text: "The relationship reflects strengths back to each other when trust is explicit."
    },
    {
      aspect: "Growth Edge",
      text: "Tension becomes productive when you name the pattern and choose a ritual."
    }
  ];
  while (aspects.length < 3) {
    const fallback = aspectFallbacks[Math.min(aspects.length, aspectFallbacks.length - 1)]!;
    aspects.push(fallback);
  }

  const rituals = [
    "Choose a weekly check-in that names one gratitude and one request.",
    "Create a shared playlist or altar that captures the relationship's emotional tone.",
    "When tension rises, pause and restate what each person needs in one sentence.",
    "Plan a monthly ritual to review promises and adjust the plan together.",
    "Celebrate a small win each week to keep the bond oriented toward growth."
  ].slice(0, length === "short" ? 3 : length === "standard" ? 4 : 5);

  return {
    overview,
    narrative,
    pairing,
    harmony,
    friction,
    growth,
    aspects,
    rituals,
    disclaimer:
      "This relationship reading is for reflection and entertainment, not medical, legal, or financial advice."
  };
};

const compatibilitySystemPrompt = `${systemPrompt}\nYou are writing a relationship compatibility (synastry) reading for two people.\n`;

export const generateCompatibilityReading = async ({
  chartA,
  chartB,
  brand,
  length,
  preferences,
  cache
}: GenerateCompatibilityInput): Promise<CompatibilityOutput> => {
  const cacheKey = `compatibility:${brand.id}:${length}:${hashObject({
    chartA,
    chartB,
    focus: preferences?.focus ?? "",
    lore: preferences?.lore ?? ""
  })}`;
  const cached = cache ? await cache.get(cacheKey) : null;
  if (cached) {
    const parsed = safeParse(cached);
    if (parsed) return parsed;
  }

  const prompt = buildPrompt(chartA, chartB, brand, length, preferences?.focus, preferences?.lore);
  let output: CompatibilityOutput | null = null;
  const llmOptions = {
    maxTokens: length === "short" ? 900 : length === "standard" ? 1400 : 2200,
    temperature: length === "deep" ? 0.8 : 0.74
  };

  const llmResponse = await callLLM(compatibilitySystemPrompt, prompt, llmOptions);
  if (llmResponse.content) {
    output = safeParse(llmResponse.content);
    if (!output) {
      const repairPrompt = `${prompt}\n\nThe previous JSON failed schema validation. Return valid JSON only.`;
      const repaired = await callLLM(compatibilitySystemPrompt, repairPrompt, llmOptions);
      if (repaired.content) {
        output = safeParse(repaired.content);
      }
    }
  }

  if (!output) {
    output = fallbackReading(chartA, chartB, brand, length);
  }

  if (cache) {
    await cache.set(cacheKey, JSON.stringify(output), 60 * 60 * 24);
  }

  return output;
};
