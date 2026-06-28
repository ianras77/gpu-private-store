import type { NatalChart } from "@astro/astro-core";
import { analyzeChart, type ChartAnalysis, type MapNode as AnalysisMapNode } from "@astro/chart-analysis";
import type { BrandConfig } from "@astro/brands";
import { hashObject } from "@astro/utils";
import { callLLM } from "./llm";
import { evaluateHumanGuideQuality, type HumanGuideQuality } from "./human-guide-quality";
import {
  HumanGuideSchema,
  SourceProvenanceSchema,
  type HumanGuide,
  type SourceUse
} from "./human-guide-schema";

export interface GenerateHumanGuideInput {
  chart: NatalChart;
  brand: BrandConfig;
  sourceProvenance: SourceUse[];
  loreContext?: string;
  cache?: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  };
}

export interface HumanGuideGenerationMeta {
  provider: string;
  model: string;
  usedFallback: boolean;
  cached: boolean;
}

export interface GenerateHumanGuideResult {
  guide: HumanGuide;
  analysis: ChartAnalysis;
  quality: HumanGuideQuality;
  meta: HumanGuideGenerationMeta;
}

type HumanGuideCacheMeta = Pick<HumanGuideGenerationMeta, "provider" | "model" | "usedFallback">;

type HumanGuideCacheEntry = {
  guide: HumanGuide;
  meta: HumanGuideCacheMeta;
};

const humanGuideSystemPrompt = [
  "You write Human Guide astrology reports as JSON only.",
  "Use a non-doctrinal Hermetic source grammar: living cosmos, correspondence, interior practice, and direct inspiration.",
  "Jesus may appear only as a wisdom teacher or compassion exemplar, never as institutional authority.",
  "Do not use fear, coercion, fatalism, church authority, or claims of the only true path.",
  "Do not make source claims unless they are grounded in the provided source provenance.",
  "Do not cite Seth or Jane Roberts unless they appear in source provenance."
].join(" ");

const sourceList = (sources: SourceUse[]): string =>
  sources.length
    ? sources
        .map(
          (source, index) =>
            `${index + 1}. ${source.title} (${source.source}) tags=${source.tags.join(", ") || "none"} sections=${
              source.sections.join(", ") || "general"
            }`
        )
        .join("\n")
    : "No external source provenance supplied.";

const chartSummary = (chart: NatalChart): string =>
  chart.points
    .map((point) => {
      const house = point.house ? `, House ${point.house}` : "";
      return `${point.key} in ${point.sign}${house}`;
    })
    .join("; ");

const buildPrompt = (
  chart: NatalChart,
  brand: BrandConfig,
  sourceProvenance: SourceUse[],
  analysis: ChartAnalysis,
  loreContext?: string
): string =>
  [
    `Brand: ${brand.name}`,
    `Brand tone keywords: ${brand.toneKeywords.join(", ")}`,
    "Human Guide lane: less mystery-brand performance, more universal, loving, practical internal map.",
    "Return valid JSON matching this structure:",
    "title, subtitle, metaFrame { world, orientation, wisdomTeacherFrame, tone }, sourceProvenance, overview, internalMap, practices, disclaimer.",
    'metaFrame.world must be exactly "living-cosmos".',
    "internalMap must include root, heartChamber, voiceAndMind, crownAndStar, shadowGate, serviceGate, inspirationGate, and paths.",
    "Each internalMap node must include name, theme, gift, distortion, practice, mantra, chartBasis, sourceBasis, and guide.",
    "Each guide section must include title, body, chartBasis, sourceBasis, and optional practice.",
    "Use concrete chart facts frequently: planet, sign, and house where available.",
    "Use sourceProvenance exactly as supplied; do not invent books, teachers, or documents.",
    "Chart facts:",
    chartSummary(chart),
    "Structured chart analysis:",
    JSON.stringify(analysis),
    "Source provenance:",
    sourceList(sourceProvenance),
    loreContext
      ? `Lore context for tone only; paraphrase, do not quote more than 10 words, and do not imply provenance unless listed above:\n${loreContext}`
      : "",
    "Practical counsel should invite the reader to notice, choose, ask, return, serve, forgive, or practice.",
    "Disclaimer must say this is reflective guidance, not medical, legal, financial, or religious authority."
  ]
    .filter(Boolean)
    .join("\n");

const safeParse = (payload: string): HumanGuide | null => {
  try {
    return HumanGuideSchema.parse(JSON.parse(payload));
  } catch {
    return null;
  }
};

const safeParseCacheEntry = (payload: string): HumanGuideCacheEntry | null => {
  try {
    const data = JSON.parse(payload) as unknown;
    const legacyGuide = HumanGuideSchema.safeParse(data);
    if (legacyGuide.success) {
      return {
        guide: legacyGuide.data,
        meta: {
          provider: "cache",
          model: "cache",
          usedFallback: false
        }
      };
    }

    if (!data || typeof data !== "object" || !("guide" in data)) {
      return null;
    }

    const envelope = data as {
      guide: unknown;
      meta?: Partial<HumanGuideCacheMeta>;
    };
    const guide = HumanGuideSchema.safeParse(envelope.guide);
    if (!guide.success) {
      return null;
    }

    return {
      guide: guide.data,
      meta: {
        provider: envelope.meta?.provider ?? "cache",
        model: envelope.meta?.model ?? "cache",
        usedFallback: envelope.meta?.usedFallback ?? false
      }
    };
  } catch {
    return null;
  }
};

const withSourceProvenance = (guide: HumanGuide, sourceProvenance: SourceUse[]): HumanGuide => ({
  ...guide,
  sourceProvenance
});

const publicChartBasis = (chartBasis: string[], fallbackBasis: string[]): string[] =>
  chartBasis.length ? chartBasis : fallbackBasis;

const basisText = (chartBasis: string[]): string =>
  chartBasis.length ? chartBasis.join("; ") : "the wider chart pattern";

const guideNode = (
  node: AnalysisMapNode,
  fallbackBasis: string[]
): HumanGuide["internalMap"]["root"] => {
  const chartBasis = publicChartBasis(node.chartBasis, fallbackBasis);

  return {
    ...node,
    chartBasis,
    guide: `${node.name} translates ${basisText(chartBasis)} into ${node.theme}. Notice the ${node.gift}, choose one grounded practice, and return to the mantra: ${node.mantra}`
  };
};

const section = (
  title: string,
  body: string,
  chartBasis: string[],
  sourceBasis: string[],
  practice: string | undefined,
  fallbackBasis: string[]
): HumanGuide["overview"][number] => ({
  title,
  body,
  chartBasis: publicChartBasis(chartBasis, fallbackBasis),
  sourceBasis,
  practice
});

const fallbackHumanGuide = (
  chart: NatalChart,
  brand: BrandConfig,
  sourceProvenance: SourceUse[],
  analysis: ChartAnalysis
): HumanGuide => {
  const map = analysis.internalMap;
  const chartFacts = chartSummary(chart);
  const fallbackBasis = [chartFacts || "No concrete chart placements were available."];
  const sun = chart.points.find((point) => point.key === "Sun");
  const moon = chart.points.find((point) => point.key === "Moon");
  const asc = chart.points.find((point) => point.key === "Asc");
  const rootBasis = publicChartBasis(map.root.chartBasis, fallbackBasis);
  const serviceBasis = publicChartBasis(map.serviceGate.chartBasis, fallbackBasis);
  const shadowBasis = publicChartBasis(map.shadowGate.chartBasis, fallbackBasis);
  const inspirationBasis = publicChartBasis(map.inspirationGate.chartBasis, fallbackBasis);

  return {
    title: `${brand.name} Human Guide`,
    subtitle: "A practical internal map for direct inspiration and loving discernment.",
    metaFrame: {
      world: "living-cosmos",
      orientation:
        "The chart is treated as a symbolic map of participation in a living cosmos, not a verdict about fate.",
      wisdomTeacherFrame:
        "Jesus is held here as a wisdom teacher of compassion, forgiveness, and direct inner alignment, without institutional authority claims.",
      tone: ["non-doctrinal", "hermetic", "practical", "loving", "direct-inspiration"]
    },
    sourceProvenance,
    overview: [
      section(
        "Living Cosmos",
        `This guide reads ${chartFacts} as correspondences between inner life and visible choices. The aim is to notice the pattern, ask what it serves, and choose a practice that makes the wisdom usable.`,
        chart.points.map((point) => `${point.key} in ${point.sign}${point.house ? `, House ${point.house}` : ""}`),
        sourceProvenance.map((source) => source.title),
        "Name one chart fact that feels alive today, then choose one action that honors it.",
        fallbackBasis
      ),
      section(
        "Heart and Direction",
        `${sun ? `${sun.key} in ${sun.sign}${sun.house ? `, House ${sun.house}` : ""}` : "The solar pattern"} points toward visible purpose, while ${
          moon ? `${moon.key} in ${moon.sign}${moon.house ? `, House ${moon.house}` : ""}` : "the lunar pattern"
        } asks for emotional honesty. Let the public path serve the private truth.`,
        [...map.crownAndStar.chartBasis, ...map.root.chartBasis],
        [...map.crownAndStar.sourceBasis, ...map.root.sourceBasis],
        "Before committing, ask whether the visible choice keeps faith with the inner need.",
        fallbackBasis
      ),
      section(
        "Direct Inspiration",
        `${asc ? `${asc.key} in ${asc.sign}` : "The presentation pattern"} sets the threshold, and ${basisText(
          inspirationBasis
        )} shows how insight becomes language. Return to simple words before making the signal grand.`,
        inspirationBasis,
        map.inspirationGate.sourceBasis,
        "Capture the spark in one sentence, then test it through one concrete practice.",
        fallbackBasis
      )
    ],
    internalMap: {
      root: guideNode(map.root, fallbackBasis),
      heartChamber: guideNode(map.heartChamber, fallbackBasis),
      voiceAndMind: guideNode(map.voiceAndMind, fallbackBasis),
      crownAndStar: guideNode(map.crownAndStar, fallbackBasis),
      shadowGate: guideNode(map.shadowGate, fallbackBasis),
      serviceGate: guideNode(map.serviceGate, fallbackBasis),
      inspirationGate: guideNode(map.inspirationGate, fallbackBasis),
      paths: map.paths.map((path) => ({
        ...path,
        chartBasis: publicChartBasis(path.chartBasis, fallbackBasis),
        guide: `${path.from} and ${path.to} form a path of ${path.tension}. Choose the medicine gently: ${path.medicine}`
      }))
    },
    practices: [
      section(
        "Root Practice",
        `Begin with ${basisText(rootBasis)}. Notice the need before solving it, then return to the body and breathe until the next honest choice is simple.`,
        rootBasis,
        map.root.sourceBasis,
        map.root.practice,
        fallbackBasis
      ),
      section(
        "Shadow Practice",
        `Work with ${shadowBasis.join("; ")} without fear. The task is not to defeat the shadow, but to forgive what defended you and choose a cleaner response.`,
        shadowBasis,
        map.shadowGate.sourceBasis,
        map.shadowGate.practice,
        fallbackBasis
      ),
      section(
        "Service Practice",
        `Let ${serviceBasis.join("; ")} serve something real. Ask what contribution can be offered without turning usefulness into self-worth.`,
        serviceBasis,
        map.serviceGate.sourceBasis,
        map.serviceGate.practice,
        fallbackBasis
      )
    ],
    disclaimer:
      "This Human Guide is for reflection, self-inquiry, and entertainment. It is not medical, legal, financial, psychological, or religious authority."
  };
};

export const generateHumanGuide = async ({
  chart,
  brand,
  sourceProvenance,
  loreContext,
  cache
}: GenerateHumanGuideInput): Promise<GenerateHumanGuideResult> => {
  const analysis = analyzeChart(chart);
  const normalizedSources = SourceProvenanceSchema.parse(sourceProvenance);
  const cacheKey = `human-guide:${brand.id}:${hashObject({
    chart,
    sourceProvenance: normalizedSources,
    loreContext: loreContext ?? ""
  })}`;
  const cached = cache ? await cache.get(cacheKey) : null;
  if (cached) {
    const parsed = safeParseCacheEntry(cached);
    if (parsed) {
      const guide = withSourceProvenance(parsed.guide, normalizedSources);
      const quality = evaluateHumanGuideQuality(guide, chart);
      if (quality.passed) {
        return {
          guide,
          analysis,
          quality,
          meta: {
            provider: parsed.meta.provider,
            model: parsed.meta.model,
            usedFallback: parsed.meta.usedFallback,
            cached: true
          }
        };
      }
    }
  }

  const prompt = buildPrompt(chart, brand, normalizedSources, analysis, loreContext);
  const llmResponse = await callLLM(humanGuideSystemPrompt, prompt, {
    maxTokens: 2200,
    temperature: 0.72
  });

  let guide = llmResponse.content ? safeParse(llmResponse.content) : null;
  if (guide) {
    guide = withSourceProvenance(guide, normalizedSources);
  }
  if (!guide && llmResponse.content) {
    const repaired = await callLLM(
      humanGuideSystemPrompt,
      `${prompt}\n\nThe previous JSON failed HumanGuideSchema validation. Return valid JSON only.`,
      {
        maxTokens: 2200,
        temperature: 0.62
      }
    );
    guide = repaired.content ? safeParse(repaired.content) : null;
    if (guide) {
      guide = withSourceProvenance(guide, normalizedSources);
    }
  }

  let usedFallback = !guide;
  let quality = guide ? evaluateHumanGuideQuality(guide, chart) : null;
  if (!guide || !quality?.passed) {
    guide = fallbackHumanGuide(chart, brand, normalizedSources, analysis);
    quality = evaluateHumanGuideQuality(guide, chart);
    usedFallback = true;
  }

  if (cache) {
    await cache.set(
      cacheKey,
      JSON.stringify({
        guide,
        meta: {
          provider: llmResponse.provider,
          model: llmResponse.model,
          usedFallback
        }
      }),
      60 * 60 * 12
    );
  }

  return {
    guide,
    analysis,
    quality,
    meta: {
      provider: llmResponse.provider,
      model: llmResponse.model,
      usedFallback,
      cached: false
    }
  };
};
