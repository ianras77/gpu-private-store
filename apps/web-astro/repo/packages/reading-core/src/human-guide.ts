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

const sourceBasis = (sourceProvenance: SourceUse[]): string[] =>
  sourceProvenance.map((source) => {
    const tags = source.tags.length ? ` (${source.tags.join(", ")})` : "";
    return `${source.title}${tags}`;
  });

const sourceLens = (sourceProvenance: SourceUse[]): string =>
  sourceProvenance.length
    ? `through ${sourceProvenance.map((source) => source.title).join(", ")}`
    : "through the supplied contemplative sources";

const sourceConcepts = (sourceProvenance: SourceUse[], loreContext?: string): string[] => {
  const concepts = new Set<string>();
  const text = `${sourceProvenance
    .flatMap((source) => [source.title, source.tags.join(" "), source.sections.join(" ")])
    .join(" ")} ${loreContext ?? ""}`.toLowerCase();

  if (text.includes("hermes") || text.includes("hermetic") || text.includes("correspondence")) {
    concepts.add("correspondence between visible pattern and invisible life");
  }
  if (text.includes("plotinus") || text.includes("participation") || text.includes("ascent")) {
    concepts.add("participation in a larger order rather than isolated selfhood");
  }
  if (text.includes("cross") || text.includes("axis")) {
    concepts.add("the crossing of vertical inspiration with horizontal action");
  }
  if (text.includes("contemplative") || text.includes("attention") || text.includes("inward")) {
    concepts.add("attention as the doorway where love becomes practical");
  }
  if (text.includes("vibration")) {
    concepts.add("vibration tested by whether it becomes kinder, clearer, and more useful");
  }

  return concepts.size
    ? Array.from(concepts)
    : ["correspondence, attention, and practical love as the shared source grammar"];
};

const sourceWeave = (concepts: string[]): string => concepts.slice(0, 3).join("; ");

const guideNode = (
  key: keyof HumanGuide["internalMap"],
  node: AnalysisMapNode,
  fallbackBasis: string[],
  sourceProvenance: SourceUse[],
  concepts: string[]
): HumanGuide["internalMap"]["root"] => {
  const chartBasis = publicChartBasis(node.chartBasis, fallbackBasis);
  const nodeSourceBasis = [...node.sourceBasis, ...sourceBasis(sourceProvenance)];
  const weave = sourceWeave(concepts);
  const guideByKey: Record<string, string> = {
    root: `Root is the ground-wire of the map. ${basisText(
      chartBasis
    )} asks the reader to let instinct become honest presence. In the source lens of ${weave}, this chamber is where inspiration descends into breath, boundary, and felt truth. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Practice it as a return, not a punishment: ${node.practice}`,
    heartChamber: `Heart Chamber is the covenant of affection. ${basisText(
      chartBasis
    )} shows where warmth wants to become visible without becoming performance. Read through ${weave}: love is not a mood but a tested alignment between attention, reciprocity, and boundary. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Let the mantra hold the measure: ${node.mantra}`,
    voiceAndMind: `Voice and Mind is the translator. ${basisText(
      chartBasis
    )} carries signal from feeling into language, study, and choice. Through ${weave}, the mind is not asked to dominate mystery; it is asked to make the signal usable. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Begin with the simple version first.`,
    crownAndStar: `Crown and Star is the visible lamp. ${basisText(
      chartBasis
    )} describes how identity, vocation, and recognition can become service. The source lens of ${weave} keeps visibility from hardening into vanity: the higher light must become a generous role. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Choose the role that matches the work.`,
    shadowGate: `Shadow Gate is the pressure chamber, not the enemy. ${basisText(
      chartBasis
    )} names where defense, fear, or control may gather. Read through ${weave}: the hidden pattern is met so it can be redeemed into practice. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Work the hard pattern in small reps, with forgiveness as the heat.`,
    serviceGate: `Service Gate is where the inner map becomes bread for the world. ${basisText(
      chartBasis
    )} asks what contribution can be offered without turning usefulness into self-worth. Through ${weave}, service is the practical altar: inspiration made visible as a loving action. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Define the service before the audience.`,
    inspirationGate: `Inspiration Gate is the receiving station. ${basisText(
      chartBasis
    )} shows how future signal, intuition, and language arrive. The source lens of ${weave} asks that vibration be tested by embodiment: if it is true, it becomes kinder, clearer, and more useful. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Capture the spark, then test it in practice.`
  };

  return {
    ...node,
    chartBasis,
    sourceBasis: nodeSourceBasis,
    guide:
      guideByKey[key] ??
      `${node.name} translates ${basisText(chartBasis)} into ${node.theme} ${sourceLens(sourceProvenance)}.`
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
  analysis: ChartAnalysis,
  loreContext?: string
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
  const provenanceBasis = sourceBasis(sourceProvenance);
  const concepts = sourceConcepts(sourceProvenance, loreContext);
  const weave = sourceWeave(concepts);

  return {
    title: `${brand.name} Human Guide`,
    subtitle: "A practical internal map for direct inspiration and loving discernment.",
    metaFrame: {
      world: "living-cosmos",
      orientation:
        "The chart is treated as a symbolic map of participation in a living cosmos: a pattern of correspondence, conscience, and choice rather than a verdict about fate.",
      wisdomTeacherFrame:
        "Jesus is held here as a wisdom teacher of compassion, forgiveness, and direct inner alignment, alongside the perennial invitation to receive inspiration directly and test it through love.",
      tone: ["non-doctrinal", "hermetic", "practical", "loving", "direct-inspiration"]
    },
    sourceProvenance,
    overview: [
      section(
        "Living Cosmos",
        `This guide reads ${chartFacts} as correspondences between inner life and visible choices. The working source grammar is ${weave}. The aim is not to become more mechanical about the self, but more awake inside it: notice the pattern, ask what it serves, and choose a practice that makes the wisdom usable.`,
        chart.points.map((point) => `${point.key} in ${point.sign}${point.house ? `, House ${point.house}` : ""}`),
        provenanceBasis,
        "Name one chart fact that feels alive today, then choose one action that honors it.",
        fallbackBasis
      ),
      section(
        "Heart and Direction",
        `${sun ? `${sun.key} in ${sun.sign}${sun.house ? `, House ${sun.house}` : ""}` : "The solar pattern"} points toward visible purpose, while ${
          moon ? `${moon.key} in ${moon.sign}${moon.house ? `, House ${moon.house}` : ""}` : "the lunar pattern"
        } asks for emotional honesty. Let the public path serve the private truth, so ambition becomes service rather than self-protection.`,
        [...map.crownAndStar.chartBasis, ...map.root.chartBasis],
        [...map.crownAndStar.sourceBasis, ...map.root.sourceBasis, ...provenanceBasis],
        "Before committing, ask whether the visible choice keeps faith with the inner need.",
        fallbackBasis
      ),
      section(
        "Direct Inspiration",
        `${asc ? `${asc.key} in ${asc.sign}` : "The presentation pattern"} sets the threshold, and ${basisText(
          inspirationBasis
        )} shows how insight becomes language. Return to simple words before making the signal grand; the truest vibration should become kinder, clearer, and more practical when it enters speech.`,
        inspirationBasis,
        [...map.inspirationGate.sourceBasis, ...provenanceBasis],
        "Capture the spark in one sentence, then test it through one concrete practice.",
        fallbackBasis
      )
    ],
    internalMap: {
      root: guideNode("root", map.root, fallbackBasis, sourceProvenance, concepts),
      heartChamber: guideNode("heartChamber", map.heartChamber, fallbackBasis, sourceProvenance, concepts),
      voiceAndMind: guideNode("voiceAndMind", map.voiceAndMind, fallbackBasis, sourceProvenance, concepts),
      crownAndStar: guideNode("crownAndStar", map.crownAndStar, fallbackBasis, sourceProvenance, concepts),
      shadowGate: guideNode("shadowGate", map.shadowGate, fallbackBasis, sourceProvenance, concepts),
      serviceGate: guideNode("serviceGate", map.serviceGate, fallbackBasis, sourceProvenance, concepts),
      inspirationGate: guideNode("inspirationGate", map.inspirationGate, fallbackBasis, sourceProvenance, concepts),
      paths: map.paths.map((path) => ({
        ...path,
        chartBasis: publicChartBasis(path.chartBasis, fallbackBasis),
        sourceBasis: [...path.sourceBasis, ...provenanceBasis],
        guide: `${path.from} and ${path.to} form a path of ${path.tension}. Read it as a living polarity, not a defect. Choose the medicine gently: ${path.medicine}`
      }))
    },
    practices: [
      section(
        "Root Practice",
        `Begin with ${basisText(rootBasis)}. Notice the need before solving it, then return to the body and breathe until the next honest choice is simple. The root is not proof of limitation; it is the place where inspiration learns to become embodied.`,
        rootBasis,
        [...map.root.sourceBasis, ...provenanceBasis],
        map.root.practice,
        fallbackBasis
      ),
      section(
        "Shadow Practice",
        `Work with ${shadowBasis.join("; ")} without fear. The task is not to defeat the shadow, but to forgive what defended you and choose a cleaner response. Pressure becomes wisdom when it is met without worshiping it.`,
        shadowBasis,
        [...map.shadowGate.sourceBasis, ...provenanceBasis],
        map.shadowGate.practice,
        fallbackBasis
      ),
      section(
        "Service Practice",
        `Let ${serviceBasis.join("; ")} serve something real. Ask what contribution can be offered without turning usefulness into self-worth. This is the practical altar: a loving action that makes the inner pattern visible.`,
        serviceBasis,
        [...map.serviceGate.sourceBasis, ...provenanceBasis],
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
    guide = fallbackHumanGuide(chart, brand, normalizedSources, analysis, loreContext);
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
