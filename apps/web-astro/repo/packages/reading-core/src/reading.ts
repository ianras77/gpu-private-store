import type { BrandConfig } from "@astro/brands";
import type { NatalChart } from "@astro/astro-core";
import { hashObject } from "@astro/utils";
import { brandPrompt, systemPrompt } from "./prompt";
import { chartFactsToString, buildChartFacts } from "./builder";
import { callLLM } from "./llm";
import { ReadingOutputSchema, type ReadingOutput } from "./schemas";

export type ReadingLength = "short" | "standard" | "deep";

export interface GenerateReadingInput {
  chart: NatalChart;
  brand: BrandConfig;
  length: ReadingLength;
  preferences?: {
    focus?: string;
    lore?: string;
    calendar?: string;
  };
  cache?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  };
}

export interface ReadingGenerationMeta {
  provider: string;
  model: string;
  usedFallback: boolean;
  cached: boolean;
}

export interface GenerateReadingResult {
  reading: ReadingOutput;
  meta: ReadingGenerationMeta;
}

const buildPrompt = (
  chart: NatalChart,
  brand: BrandConfig,
  length: ReadingLength,
  focus?: string,
  lore?: string,
  calendar?: string
) => {
  const facts = chartFactsToString(chart, brand);
  const narrativeGuidance =
    length === "short"
      ? "Narrative: 2 paragraphs, 60-90 words each."
      : length === "standard"
      ? "Narrative: 3-4 paragraphs, 80-110 words each."
      : "Narrative: 6-8 paragraphs, 90-140 words each.";
  return [
    brandPrompt(brand),
    `Length: ${length}`,
    focus ? `User focus: ${focus}` : "",
    lore
      ? "Lore context (for inspiration only; paraphrase, no direct quotes longer than 10 words; do not mention sources):\n" +
        lore
      : "",
    calendar ? `Ritual calendar facts:\n${calendar}` : "",
    "Chart facts:",
    facts,
    "Return JSON with keys: title, subtitle, excerpt, overview, narrative, characterSheet, bigThree, planets, houses?, aspects, brandLens, ritualCalendar, actionables, disclaimer.",
    "Title should feel like the name of a private chart report.",
    "Subtitle should be a one-line hook under 18 words.",
    "Excerpt should be 1-2 sentences suitable for a saved feed card.",
    "Overview should be 5-8 short lines (not bullets).",
    narrativeGuidance,
    "Big Three should interpret Sun, Moon, and Rising; if time is unknown, use presentation instead of rising.",
    "Planets: include all available planets and mention sign + house in each entry.",
    "Aspects: 3-6 highlights tied to the listed aspects.",
    "Brand lens should mirror the focus modules with 2-4 sentences each.",
    "Character sheet: include title, 2-5 archetypes, 2-5 strengths, 2-5 shadows, 2-5 path steps, and a short motto.",
    "Ritual calendar: 5-14 entries with date, title, focus, ritual, and optional transit. Ground in the ritual calendar facts.",
    "Actionables should be 3-5 ritual-like prompts, one sentence each."
  ]
    .filter(Boolean)
    .join("\n");
};

const safeParse = (payload: string): ReadingOutput | null => {
  try {
    const data = JSON.parse(payload);
    return ReadingOutputSchema.parse(data);
  } catch {
    return null;
  }
};

const fallbackReading = (chart: NatalChart, brand: BrandConfig, length: ReadingLength): ReadingOutput => {
  const facts = buildChartFacts(chart);
  const overviewLines = [
    `This chart emphasizes ${facts.bigThree.sun || "core vitality"} and ${facts.bigThree.moon || "emotional cadence"}.`,
    `You carry a distinct rhythm: ${facts.bigThree.rising ? facts.bigThree.rising : "a grounded presentation style"}.`,
    `Key signatures cluster around ${facts.placements.slice(0, 3).join("; ")}.`,
    `The chart highlights ${facts.aspects.slice(0, 2).join("; ")}.`,
    `The prevailing tone is ${brand.toneKeywords.slice(0, 2).join(" and ")}.`,
    `Lean into steady, intentional choices over dramatic pivots.`,
    `Your growth edge is defined by clarity, not speed.`
  ].slice(0, length === "short" ? 5 : length === "standard" ? 6 : 8);

  const aspectHighlights = facts.aspects.slice(0, 2);
  const placementHighlights = facts.placements.slice(0, 3);
  const houseHighlights = facts.houses.slice(0, 2);
  const elementFocus = facts.dominantElements.length ? facts.dominantElements.join(" and ") : "a blended palette";
  const modalityFocus = facts.dominantModalities.length ? facts.dominantModalities.join(" and ") : "a mixed tempo";

  const narrativeBlocks = [
    `Your chart opens with ${facts.bigThree.sun || "a luminous core"} and ${facts.bigThree.moon || "a steady emotional cadence"}, setting a mythic tension between what fuels you and what steadies you. ${
      facts.bigThree.rising
        ? `The world meets you through ${facts.bigThree.rising}, a doorway that shapes your first impact.`
        : "With time unknown, your presentation is inferred from the Sun and Moon signatures."
    }`,
    `Elemental balance leans toward ${elementFocus}, which colors your instincts with a consistent atmospheric tone. The modalities emphasize ${modalityFocus}, showing how you initiate, sustain, and adapt.`,
    aspectHighlights.length
      ? `The chart’s tightest aspects, including ${aspectHighlights.join("; ")}, act like the mythic knots in your story. These are the tension lines that create momentum, asking you to integrate opposites rather than choose sides.`
      : "The aspect geometry of your chart creates a living tension that asks you to integrate opposites rather than choose sides.",
    placementHighlights.length
      ? `Planetary placements such as ${placementHighlights.join("; ")} reveal where your attention naturally returns. These are the rooms in your inner temple where you keep the most power, the places you revisit when you need truth.`
      : "Your planetary placements reveal where attention returns again and again, the rooms of your inner temple that hold your power.",
    facts.houses.length
      ? `House cusps like ${houseHighlights.join(" and ")} show where the sky meets the earth in your life. These thresholds highlight the arenas where your commitments must be consciously chosen.`
      : "Without house data, the reading stays focused on sign and aspect dynamics, emphasizing inner patterns over external arenas.",
    `The brand lens of ${brand.focusModules.map((module) => module.title).join(" and ")} frames your next steps. Think of it as the ritual map: refine one structure, release one drain, and choose the boldest honest act that still feels true.`
  ].filter(Boolean);

  const narrative = narrativeBlocks.slice(0, length === "short" ? 2 : length === "standard" ? 4 : 6);

  const characterSheet = {
    title: `${brand.name} Archetype`,
    archetypes: [
      facts.dominantElements.length ? `${facts.dominantElements[0]} Keeper` : "The Seeker",
      facts.dominantModalities.length ? `${facts.dominantModalities[0]} Builder` : "The Maker"
    ].filter(Boolean),
    strengths: [
      "Perception that reads the room before it speaks.",
      "Stamina for the long arc of growth."
    ],
    shadows: [
      "Over-identifying with a single role.",
      "Holding the line so tightly that movement feels risky."
    ],
    path: [
      "Name the vow you are ready to keep.",
      "Practice a ritual that proves the vow in daily life."
    ],
    motto: "Clarity is devotion."
  };

  const today = new Date();
  const ritualCalendar = Array.from({ length: length === "short" ? 5 : length === "standard" ? 7 : 10 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const dateLabel = date.toISOString().slice(0, 10);
    return {
      date: dateLabel,
      title: "Daily Rite",
      focus: "Inner alignment",
      ritual: "Light a candle, name one intention, and complete a single deliberate action.",
      transit: "Transits calibrated to your chart."
    };
  });

  const planets = chart.points
    .filter((p) => p.type === "planet")
    .map((p) => ({
      planet: p.key,
      text: `${p.key} in ${p.sign} suggests a ${brand.toneKeywords[0]} approach to ${p.key.toLowerCase()} themes.`
    }));

  const houses = chart.houses
    ? chart.houses.cusps.map((_, index) => ({
        house: index + 1,
        text: `House ${index + 1} calls for deliberate focus and boundary-aware growth.`
      }))
    : undefined;

  const aspects = chart.aspects.slice(0, 6).map((aspect) => ({
    aspect: `${aspect.between.join(" & ")} ${aspect.type}`,
    text: "This aspect adds tension and momentum, inviting conscious integration."
  }));

  const brandLens = brand.focusModules.map((module) => ({
    title: module.title,
    text: `${module.description} Focus on one high-impact choice this week.`
  }));

  const actionables = [
    "Name one habit that will amplify your next 30 days.",
    "Design a boundary that protects your energy and time.",
    "Choose a single bold step that aligns with your long-term story.",
    "Schedule a reflection ritual that keeps you accountable.",
    "Document one win that proves your momentum is real."
  ].slice(0, length === "short" ? 3 : length === "standard" ? 4 : 5);

  return {
    title: `${brand.name} Birth Chart Report`,
    subtitle: "A chart reading for your private grimoire.",
    excerpt: overviewLines.slice(0, 2).join(" "),
    overview: overviewLines,
    narrative,
    characterSheet,
    bigThree: {
      sun: facts.bigThree.sun,
      moon: facts.bigThree.moon,
      rising: facts.bigThree.rising,
      presentation: chart.meta.timeUnknown
        ? "Presentation style inferred from Sun/Moon emphasis."
        : undefined
    },
    planets,
    houses,
    aspects,
    brandLens,
    ritualCalendar,
    actionables,
    disclaimer:
      "This reading is for reflection and entertainment, not medical, legal, or financial advice."
  };
};

export const generateReading = async ({
  chart,
  brand,
  length,
  preferences,
  cache
}: GenerateReadingInput): Promise<GenerateReadingResult> => {
  const cacheKey = `reading:${brand.id}:${length}:${hashObject({
    chart,
    focus: preferences?.focus ?? "",
    lore: preferences?.lore ?? "",
    calendar: preferences?.calendar ?? ""
  })}`;
  const cached = cache ? await cache.get(cacheKey) : null;
  if (cached) {
    const parsed = safeParse(cached);
    if (parsed) {
      return {
        reading: parsed,
        meta: {
          provider: "cache",
          model: "cache",
          usedFallback: false,
          cached: true
        }
      };
    }
  }

  const prompt = buildPrompt(chart, brand, length, preferences?.focus, preferences?.lore, preferences?.calendar);
  let output: ReadingOutput | null = null;
  const llmOptions = {
    maxTokens: length === "short" ? 900 : length === "standard" ? 1400 : 2200,
    temperature: length === "deep" ? 0.82 : 0.75
  };

  const llmResponse = await callLLM(systemPrompt, prompt, llmOptions);
  if (llmResponse.content) {
    output = safeParse(llmResponse.content);
    if (!output) {
      const repairPrompt = `${prompt}\n\nThe previous JSON failed schema validation. Return valid JSON only.`;
      const repaired = await callLLM(systemPrompt, repairPrompt, llmOptions);
      if (repaired.content) {
        output = safeParse(repaired.content);
      }
    }
  }

  if (!output) {
    output = fallbackReading(chart, brand, length);
  }

  if (cache) {
    await cache.set(cacheKey, JSON.stringify(output), 60 * 60 * 24);
  }

  return {
    reading: output,
    meta: {
      provider: llmResponse.provider,
      model: llmResponse.model,
      usedFallback: !llmResponse.content,
      cached: false
    }
  };
};
