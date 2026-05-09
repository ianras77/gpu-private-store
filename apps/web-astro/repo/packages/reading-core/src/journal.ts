import type { BrandConfig } from "@astro/brands";
import type { NatalChart } from "@astro/astro-core";
import { hashObject } from "@astro/utils";
import { buildChartFacts, chartFactsToString } from "./builder";
import { callLLM } from "./llm";
import { weeklyBrandPrompt, weeklySystemPrompt } from "./prompt";
import { WeeklyContentOutputSchema, type WeeklyContentOutput } from "./schemas";

export interface GenerateWeeklyContentInput {
  chart: NatalChart;
  brand: BrandConfig;
  weekOf: string;
  previousEntries?: Array<{
    title: string;
    excerpt: string;
  }>;
  cache?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  };
}

export interface WeeklyContentMeta {
  provider: string;
  model: string;
  usedFallback: boolean;
  cached: boolean;
}

export interface GenerateWeeklyContentResult {
  entry: WeeklyContentOutput;
  meta: WeeklyContentMeta;
}

const safeParse = (payload: string): WeeklyContentOutput | null => {
  try {
    return WeeklyContentOutputSchema.parse(JSON.parse(payload));
  } catch {
    return null;
  }
};

const buildPrompt = (
  chart: NatalChart,
  brand: BrandConfig,
  weekOf: string,
  previousEntries: Array<{ title: string; excerpt: string }> = []
) => {
  const facts = chartFactsToString(chart, brand);
  const previous = previousEntries.length
    ? previousEntries.map((item, index) => `Recent entry ${index + 1}: ${item.title} :: ${item.excerpt}`).join("\n")
    : "No previous journal entries yet.";
  return [
    weeklyBrandPrompt(brand),
    `Week of: ${weekOf}`,
    "Write a weekly personal grimoire entry rooted in the natal chart, with fresh emotional weather and rituals for the week ahead.",
    "Chart facts:",
    facts,
    "Recent entries for continuity:",
    previous,
    "Return JSON with keys: title, excerpt, weekOf, opening, atmosphere, sections, rituals, moments, closing, disclaimer.",
    "Title should feel like a post in a personal spellbook.",
    "Excerpt should be 1-2 sentences for a feed card.",
    "Opening should be a vivid paragraph that names the mood of the week.",
    "Atmosphere should be 3-5 short phrases.",
    "Sections should contain 3-5 titled blocks with 2-5 sentence bodies.",
    "Rituals should be 3-5 concrete witchy prompts.",
    "Moments should be 3-7 entries naming a day or moment, a short title, and practical guidance.",
    "Closing should end in a memorable benediction without sounding grandiose."
  ].join("\n");
};

const fallbackWeeklyContent = (
  chart: NatalChart,
  brand: BrandConfig,
  weekOf: string
): WeeklyContentOutput => {
  const facts = buildChartFacts(chart);
  const bigThree = [facts.bigThree.sun, facts.bigThree.moon, facts.bigThree.rising].filter(Boolean).join(" | ");
  const leadElement = facts.dominantElements[0] ?? "Aether";
  const leadModality = facts.dominantModalities[0] ?? "Mutable";

  return {
    title: `${brand.name} Weekly Grimoire`,
    excerpt: `A ${leadElement.toLowerCase()}-lit week for ${brand.name} themes, guided by ${bigThree || "your natal signatures"}.`,
    weekOf,
    opening: `The week opens under the memory of ${bigThree || "your natal patterning"}, asking you to move with ${leadElement.toLowerCase()} instinct and ${leadModality.toLowerCase()} timing. This is a week for quiet conviction, good boundaries, and small rituals that keep your power close.`,
    atmosphere: [
      `${leadElement} current`,
      `${leadModality} pacing`,
      `${brand.focusModules[0]?.title ?? "Ritual"} focus`
    ],
    sections: [
      {
        title: "Where the energy gathers",
        body: `Your chart emphasizes ${facts.placements.slice(0, 3).join("; ") || "a strong natal signature"}. Notice where your attention keeps circling. That is where the week is asking for devotion rather than urgency.`
      },
      {
        title: "What wants discipline",
        body: `The chart's strongest tension lines, including ${facts.aspects.slice(0, 2).join("; ") || "its major aspects"}, ask you to choose structure over drama. Protect the pace that lets your wisdom stay audible.`
      },
      {
        title: "What can bloom",
        body: `${brand.focusModules.map((module) => module.title).join(" and ")} are especially active here. Let one small action become the spell that proves you are already in motion.`
      }
    ],
    rituals: [
      "Light a candle before your first focused task and name the mood you want to keep.",
      "Write down one boundary that protects this week's energy and honor it aloud.",
      "End the day with a five-minute check-in on what felt true, not just productive."
    ],
    moments: [
      {
        day: "Monday",
        title: "Cast the week",
        guidance: "Choose one intention, one boundary, and one practical promise."
      },
      {
        day: "Midweek",
        title: "Tend the threshold",
        guidance: "Pause before reacting. Let instinct and structure meet before you answer."
      },
      {
        day: "Weekend",
        title: "Close the circle",
        guidance: "Review the week like a spellbook margin note: what worked, what drained, what should continue."
      }
    ],
    closing: "Keep the ritual small enough to repeat and sacred enough to matter.",
    disclaimer:
      "This weekly entry is for reflection and entertainment, not medical, legal, or financial advice."
  };
};

export const generateWeeklyContent = async ({
  chart,
  brand,
  weekOf,
  previousEntries,
  cache
}: GenerateWeeklyContentInput): Promise<GenerateWeeklyContentResult> => {
  const cacheKey = `weekly:${brand.id}:${weekOf}:${hashObject({
    chart,
    previousEntries: previousEntries ?? []
  })}`;
  const cached = cache ? await cache.get(cacheKey) : null;
  if (cached) {
    const parsed = safeParse(cached);
    if (parsed) {
      return {
        entry: parsed,
        meta: {
          provider: "cache",
          model: "cache",
          usedFallback: false,
          cached: true
        }
      };
    }
  }

  const prompt = buildPrompt(chart, brand, weekOf, previousEntries);
  const llmResponse = await callLLM(weeklySystemPrompt, prompt, {
    maxTokens: 1400,
    temperature: 0.86
  });

  let entry = llmResponse.content ? safeParse(llmResponse.content) : null;
  if (!entry && llmResponse.content) {
    const repaired = await callLLM(
      weeklySystemPrompt,
      `${prompt}\n\nThe previous JSON failed schema validation. Return valid JSON only.`,
      {
        maxTokens: 1400,
        temperature: 0.78
      }
    );
    entry = repaired.content ? safeParse(repaired.content) : null;
  }

  if (!entry) {
    entry = fallbackWeeklyContent(chart, brand, weekOf);
  }

  if (cache) {
    await cache.set(cacheKey, JSON.stringify(entry), 60 * 60 * 6);
  }

  return {
    entry,
    meta: {
      provider: llmResponse.provider,
      model: llmResponse.model,
      usedFallback: !llmResponse.content,
      cached: false
    }
  };
};
