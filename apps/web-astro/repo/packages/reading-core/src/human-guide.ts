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

export type BrandMysticLens = HumanGuide["brandLens"];

export const BRAND_MYSTIC_LENSES: Record<BrandConfig["id"], Omit<BrandMysticLens, "brandId" | "domain">> = {
  jupiterseek: {
    archetypalCharge: "Jupiter as the seeker, threshold-opener, generous teacher, and guardian of meaningful expansion.",
    giftInvitation: "Lean toward courage, blessing, study, quest, abundance, and the doors that open when preparation meets grace.",
    shadowInvitation: "Watch for scattering, over-promising, spiritual bypass, or confusing optimism with devotion.",
    reportBias: "Emphasize growth edges, purpose, faith tested by action, opportunity by house, and the reader's next noble quest.",
    styleRules: [
      "Make the chart feel like a map of roads, thresholds, teachers, and meaningful invitations.",
      "Let practical counsel turn hope into preparation.",
      "Keep expansion warm and discerning rather than grandiose."
    ]
  },
  saturnseer: {
    archetypalCharge: "Saturn as the seer of shadow, boundary, time, discipline, consequence, and earned inner authority.",
    giftInvitation: "Lean toward maturity, repair, structure, vows, patience, craft, and the dignity of choosing what is real.",
    shadowInvitation: "Go directly to fear, avoidance, shame, control, delay, and the places where pressure wants to become wisdom.",
    reportBias: "Emphasize shadow gates, karmic patterning as responsibility not punishment, practical boundaries, and slow mastery.",
    styleRules: [
      "Make the chart feel like a lantern brought into a stone chamber.",
      "Name the hard thing without doom, blame, or humiliation.",
      "Turn every shadow insight into one humane structure or vow."
    ]
  },
  saturnleo: {
    archetypalCharge: "Saturn in the solar hall: creative sovereignty, visible craft, warmth under discipline, and the crown earned by service.",
    giftInvitation: "Lean toward noble self-expression, leadership with restraint, creative devotion, and the courage to be seen cleanly.",
    shadowInvitation: "Watch pride, performance, hidden fear of exposure, or the wound that mistakes applause for love.",
    reportBias: "Emphasize the Sun, MC, 5th/10th houses, creative responsibility, and the anvil where charisma becomes character.",
    styleRules: [
      "Make the report feel regal, warm, spare, and ceremonial.",
      "Treat visibility as service rather than spectacle.",
      "Offer practices that refine voice, craft, timing, and courage."
    ]
  },
  maleficme: {
    archetypalCharge: "The malefics as truth-bringers: Mars and Saturn pressure that cuts through avoidance and teaches clean power.",
    giftInvitation: "Lean toward candor, transmutation, courage, fierce honesty, and the liberation that comes from meeting the pattern.",
    shadowInvitation: "Enter the difficult material: anger, defense, compulsion, resentment, fear, and the old armor that wants a new job.",
    reportBias: "Emphasize hard aspects, Mars, Saturn, Pluto, 8th/12th-house material, and the alchemy of pressure into agency.",
    styleRules: [
      "Be direct and vivid without cruelty.",
      "Make shadow work feel powerful, not performatively dark.",
      "Always turn the hard truth into a next action, repair, or boundary."
    ]
  },
  oracleveil: {
    archetypalCharge: "The veil as threshold: dream, symbol, intuition, liminal timing, and the soft door between visible and invisible life.",
    giftInvitation: "Lean toward listening, symbol, ritual, dreams, tenderness, and direct inspiration that becomes embodied.",
    shadowInvitation: "Watch projection, vagueness, romantic fog, avoidance, or mistaking mystery for permission to drift.",
    reportBias: "Emphasize Moon, Neptune, Uranus, 12th/9th/3rd-house signals, dreams, divination-as-inquiry, and grounded ritual.",
    styleRules: [
      "Make the report feel intimate, oracular, and tenderly strange.",
      "Keep mystery grounded in choice, body, and care.",
      "Use images that can keep unfolding when reread months later."
    ]
  }
};

export const brandMysticLens = (brand: BrandConfig): BrandMysticLens => ({
  brandId: brand.id,
  domain: brand.domain,
  ...BRAND_MYSTIC_LENSES[brand.id]
});

const humanGuideSystemPrompt = [
  "You write Human Guide astrology reports as JSON only.",
  "Use a non-doctrinal Hermetic source grammar: living cosmos, correspondence, interior practice, and direct inspiration.",
  "Jesus may appear only as a wisdom teacher or compassion exemplar, never as institutional authority.",
  "Each section should feel crafted by an attentive guide: educational, allegorical, practical, spiritual, whimsical, and mind-opening.",
  "Give the reader agency, responsibility, wonder, and the sense of a universe inside them: as above, so below.",
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

const aspectSummary = (chart: NatalChart): string =>
  chart.aspects.length
    ? chart.aspects
        .map((aspect) => `${aspect.between.join(" & ")} ${aspect.type}, orb ${aspect.orb}, exact ${aspect.exact}`)
        .join("; ")
    : "No major aspects were supplied.";

const basisLines = (items: { chartBasis: string[]; sourceBasis: string[] }[]): string =>
  items.length
    ? items
        .map(
          (item, index) =>
            `${index + 1}. chart=${item.chartBasis.join(", ") || "none"} source=${
              item.sourceBasis.join(", ") || "none"
            }`
        )
        .join("\n")
    : "None supplied.";

const buildPrompt = (
  chart: NatalChart,
  brand: BrandConfig,
  sourceProvenance: SourceUse[],
  analysis: ChartAnalysis,
  loreContext?: string
): string => {
  const lens = brandMysticLens(brand);
  return [
    `Brand: ${brand.name}`,
    `Brand domain: ${brand.domain}`,
    `Brand tone keywords: ${brand.toneKeywords.join(", ")}`,
    "Brand mystic lens:",
    JSON.stringify(lens),
    "Human Guide lane: less mystery-brand performance, more universal, loving, practical internal map.",
    "Return valid JSON matching this structure:",
    "title, subtitle, brandLens, metaFrame { world, orientation, wisdomTeacherFrame, tone }, sourceProvenance, overview, internalMap, practices, disclaimer.",
    "brandLens must exactly reflect the supplied Brand mystic lens.",
    'metaFrame.world must be exactly "living-cosmos".',
    "internalMap must include root, bodyTemple, heartChamber, voiceAndMind, crownAndStar, shadowGate, serviceGate, inspirationGate, and paths.",
    "Each internalMap node must include name, theme, gift, distortion, practice, mantra, chartBasis, sourceBasis, and guide.",
    "Each guide section must include title, body, chartInstruction, force, allegory, story, practicalCounsel, mysteryQuestion, chartBasis, sourceBasis, and optional practice.",
    "For every guide section: chartInstruction says plainly what the chart says and names the chart facts being interpreted; force explains the astrological pressure or invitation in plain language; allegory gives an image or symbolic scene; story gives a short parable in the spirit of wisdom teaching, plain enough to understand now and layered enough to reread later; practicalCounsel gives one grounded way to live the section; mysteryQuestion ends with a question mark and opens self-inquiry.",
    "Think of Jesus as a wisdom teacher in method: clear instruction, then parable, then an invitation to practice. Do not preach doctrine, quote scripture, or claim religious authority.",
    "Required overview section plan: 1 Living Cosmos, 2 Brand Gate, 3 Whole Chart Mandala, 4 Heart and Direction, 5 Aspect Web, 6 Direct Inspiration.",
    "Required practices section plan: Root Practice, Body Temple Practice, Shadow Practice, Aspect Integration Practice, Service Practice.",
    "Brand Gate must lean into the domain-specific lens. For Saturnseer, enter shadow, time, boundary, and earned wisdom. For Jupiterseek, open growth, quest, meaning, and blessing. For Malefic Me, make hard material useful. For Oracle Veil, make intuition embodied. For Saturn Leo, refine visibility into service.",
    "Whole Chart Mandala must weave all supplied planets and angles at least once across the report, with sign and house when available.",
    "Aspect Web must explain the major aspects as relationships between inner forces, naming hard aspects as integration work and grace aspects as channels to use consciously.",
    "Use concrete chart facts frequently: planet, sign, and house where available.",
    "Make the report agentic: cover required sections, but make each section detailed, nuanced, personal, allegorical, practical, educational, and spiritually spacious.",
    "The reader should leave feeling the power of their birth, the responsibility of finding oneself, and excitement that mysteries remain waiting inside them.",
    "Use sourceProvenance exactly as supplied; do not invent books, teachers, or documents.",
    "Chart facts:",
    chartSummary(chart),
    "Aspect facts:",
    aspectSummary(chart),
    "Integration tensions:",
    basisLines(analysis.integrationTensions),
    "Grace channels:",
    basisLines(analysis.graceChannels),
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
};

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

type SourceConceptRule = {
  id: string;
  match: string[];
  concept: string;
};

const SOURCE_CONCEPT_RULES: SourceConceptRule[] = [
  {
    id: "hermetic-correspondence",
    match: ["hermes", "hermetic", "correspondence"],
    concept: "correspondence between visible pattern and invisible life"
  },
  {
    id: "plotinian-participation",
    match: ["plotinus", "participation", "ascent"],
    concept: "participation in a larger order rather than isolated selfhood"
  },
  {
    id: "cross-axis",
    match: ["cross", "axis"],
    concept: "the crossing of vertical inspiration with horizontal action"
  },
  {
    id: "contemplative-attention",
    match: ["contemplative", "attention", "inner practice", "inner ascent"],
    concept: "attention as the doorway where love becomes practical"
  },
  {
    id: "embodied-vibration",
    match: ["vibration", "embodiment"],
    concept: "vibration tested by whether it becomes kinder, clearer, and more useful"
  }
];

export const sourceConcepts = (sourceProvenance: SourceUse[]): string[] => {
  const concepts = new Set<string>();
  for (const source of sourceProvenance) {
    const evidence = [source.title, ...source.tags, ...source.sections].join(" ").toLowerCase();
    for (const rule of SOURCE_CONCEPT_RULES) {
      if (rule.match.some((token) => evidence.includes(token))) {
        concepts.add(rule.concept);
      }
    }
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
    bodyTemple: `Body Temple is the chapel of capacity. ${basisText(
      chartBasis
    )} shows how money, food, pace, labor, rest, and daily rhythm become spiritual materials rather than background noise. Through ${weave}, embodiment is the test of vibration: the truest signal becomes livable. The gift is ${
      node.gift
    }; the distortion is ${node.distortion}. Let devotion become a schedule the body can trust: ${node.practice}`,
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
  chartInstruction: string,
  force: string,
  allegory: string,
  story: string,
  practicalCounsel: string,
  mysteryQuestion: string,
  chartBasis: string[],
  sourceBasis: string[],
  practice: string | undefined,
  fallbackBasis: string[]
): HumanGuide["overview"][number] => ({
  title,
  body,
  chartInstruction,
  force,
  allegory,
  story,
  practicalCounsel,
  mysteryQuestion,
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
  const lens = brandMysticLens(brand);
  const chartFacts = chartSummary(chart);
  const aspectFacts = aspectSummary(chart);
  const fallbackBasis = [chartFacts || "No concrete chart placements were available."];
  const sun = chart.points.find((point) => point.key === "Sun");
  const moon = chart.points.find((point) => point.key === "Moon");
  const asc = chart.points.find((point) => point.key === "Asc");
  const allPlacementBasis = chart.points.map((point) => `${point.key} in ${point.sign}${point.house ? `, House ${point.house}` : ""}`);
  const rootBasis = publicChartBasis(map.root.chartBasis, fallbackBasis);
  const bodyBasis = publicChartBasis(map.bodyTemple.chartBasis, fallbackBasis);
  const serviceBasis = publicChartBasis(map.serviceGate.chartBasis, fallbackBasis);
  const shadowBasis = publicChartBasis(map.shadowGate.chartBasis, fallbackBasis);
  const inspirationBasis = publicChartBasis(map.inspirationGate.chartBasis, fallbackBasis);
  const aspectBasisList = chart.aspects.map(
    (aspect) => `${aspect.between.join(" & ")} ${aspect.type} with ${aspect.orb} orb`
  );
  const tensionBasis = analysis.integrationTensions.flatMap((item) => item.chartBasis);
  const graceBasis = analysis.graceChannels.flatMap((item) => item.chartBasis);
  const provenanceBasis = sourceBasis(sourceProvenance);
  const concepts = sourceConcepts(sourceProvenance);
  const weave = sourceWeave(concepts);

  return {
    title: `${brand.name} Birth Mandala`,
    subtitle: `A practical internal map shaped through ${lens.archetypalCharge}`,
    brandLens: lens,
    metaFrame: {
      world: "living-cosmos",
      orientation:
        `The chart is treated as a symbolic map of participation in a living cosmos: a pattern of correspondence, conscience, and choice rather than a verdict about fate. On ${brand.domain}, the report is tilted through ${lens.reportBias}`,
      wisdomTeacherFrame:
        "Jesus is held here as a wisdom teacher of compassion, forgiveness, and direct inner alignment, alongside the perennial invitation to receive inspiration directly and test it through love.",
      tone: ["non-doctrinal", "hermetic", "practical", "loving", "direct-inspiration", brand.id]
    },
    sourceProvenance,
    overview: [
      section(
        "Living Cosmos",
        `This guide reads ${chartFacts} as correspondences between inner life and visible choices. The working source grammar is ${weave}. The aim is not to become more mechanical about the self, but more awake inside it: notice the pattern, ask what it serves, and choose a practice that makes the wisdom usable.`,
        `Instruction: read the supplied placements as the foundation of the report. The chart says these planets, signs, and houses are the primary symbolic materials to study before making meaning: ${chartFacts}.`,
        `The force here is correspondence: as above, so below, not as a slogan but as a responsibility. The chart describes pressures, gifts, appetites, and openings that ask to become conscious choice rather than unconscious repetition.`,
        "Imagine the birth chart as a lamp lowered into a many-roomed house. Some rooms are golden, some dusty, some locked, but every room belongs to the same inner dwelling. The work is not to worship the lamp; it is to walk by its light.",
        "A teacher once pointed to a lamp and a house: the lamp was not the house, and the house was not the light, yet without the lamp the rooms stayed confused. So the student carried the lamp room by room, learning that revelation is patient and practical.",
        "Choose one placement that feels alive, then translate it into one behavior today: a boundary, a confession, a study hour, a generous act, or a return to the body.",
        "What part of the universe inside you is asking to be entered with more courage?",
        chart.points.map((point) => `${point.key} in ${point.sign}${point.house ? `, House ${point.house}` : ""}`),
        provenanceBasis,
        "Name one chart fact that feels alive today, then choose one action that honors it.",
        fallbackBasis
      ),
      section(
        "Brand Gate",
        `${brand.name} opens this chart through ${lens.archetypalCharge} The gift invitation is ${lens.giftInvitation} The shadow invitation is equally important: ${lens.shadowInvitation} This is how the same natal chart changes voice by domain without changing its bones. The calculation remains the foundation; the lens decides where the lantern is aimed first.`,
        `Instruction: keep the same chart facts, but emphasize them through ${brand.domain}. This report should especially notice: ${lens.reportBias}`,
        `The force is emphasis. ${brand.domain} does not rewrite the sky; it chooses which chamber of the sky to enter with the most devotion. ${lens.reportBias}`,
        "Imagine five readers entering the same temple by five doors. Jupiter enters through the road of blessing, Saturn through the stone stair of consequence, the oracle through the curtain of dream, the malefic through the furnace, and the solar king through the hall of craft. The temple is one; the first threshold changes what the soul notices.",
        "The parable is simple: five people found the same well. One called it mercy, one discipline, one dream, one fire, and one crown. The water did not change, but each name taught a different way to draw it.",
        lens.styleRules.join(" "),
        "Which doorway into your chart makes you more honest, more awake, and more loving?",
        [...allPlacementBasis, ...aspectBasisList],
        provenanceBasis,
        "Read the same chart once through gift, once through shadow, then choose the version that asks for the cleanest action.",
        fallbackBasis
      ),
      section(
        "Whole Chart Mandala",
        `The mandala begins with the full wheel: ${chartFacts}. Each placement is a room, and each room asks a different kind of attention. The Sun shows the lamp of identity, the Moon the weather of need, Mercury the interpreter, Venus the relational art, Mars the blade of action, Jupiter the blessing that must be practiced, Saturn the boundary that matures desire, Uranus the breaker of stale pattern, Neptune the dream-fog and devotion, Pluto the underworld pressure, and the angles the gates where inner life meets the world.`,
        `Instruction: do not reduce the person to one sign. Teach the whole chart by giving every supplied point a role in the inner council: ${allPlacementBasis.join("; ")}.`,
        "The force is wholeness. A person is not one sign or one slogan; the chart is a council of voices asking to be governed by consciousness rather than by the loudest impulse.",
        "Picture a round table lit by a central candle. Every planet has a chair. Some speak in poetry, some in law, some in hunger, some in thunder. The art is not to silence the difficult ones; it is to let the true king or queen within call the council into order.",
        "A householder had many servants and blamed the noisy one for every broken dish. A wise guest asked to meet all of them. By evening the householder saw that the quiet servant had hidden the keys, the gentle one had neglected the fire, and the noisy one had only been sounding the alarm.",
        "Choose three placements: one that feels natural, one that feels difficult, and one that feels mysterious. Give each one a sentence, a boundary, and a small act.",
        "If every planet in you had a seat at the table, which voice needs to be heard without being allowed to rule alone?",
        allPlacementBasis,
        provenanceBasis,
        "Write a one-line vow for the loudest placement and a one-line blessing for the quietest placement.",
        fallbackBasis
      ),
      section(
        "Heart and Direction",
        `${sun ? `${sun.key} in ${sun.sign}${sun.house ? `, House ${sun.house}` : ""}` : "The solar pattern"} points toward visible purpose, while ${
          moon ? `${moon.key} in ${moon.sign}${moon.house ? `, House ${moon.house}` : ""}` : "the lunar pattern"
        } asks for emotional honesty. Let the public path serve the private truth, so ambition becomes service rather than self-protection.`,
        `Instruction: teach the relationship between the Sun and Moon first. The Sun describes visible vitality and direction; the Moon describes need, memory, and emotional truth. ${sun ? `Here the Sun is ${sun.sign}${sun.house ? ` in House ${sun.house}` : ""}.` : ""} ${moon ? `Here the Moon is ${moon.sign}${moon.house ? ` in House ${moon.house}` : ""}.` : ""}`,
        "The force is the meeting of identity and need: the solar call to become visible must learn the lunar art of staying emotionally true.",
        "This is the parable of a crown that can only be worn by the child it once protected. If the public self forgets the private self, the crown grows heavy; when they bless each other, vocation becomes warm.",
        "A child carried a crown in a cloth bundle for many years, afraid it would make others leave. When the child grew, the crown was not placed above the heart but beside it, and the kingdom became a place where tenderness could govern strength.",
        "Before choosing the visible path, ask what feeling it must protect, honor, or repair. Let direction be a form of care rather than escape.",
        "Where is your life asking achievement to become a vessel for love?",
        [...map.crownAndStar.chartBasis, ...map.root.chartBasis],
        [...map.crownAndStar.sourceBasis, ...map.root.sourceBasis, ...provenanceBasis],
        "Before committing, ask whether the visible choice keeps faith with the inner need.",
        fallbackBasis
      ),
      section(
        "Aspect Web",
        `The aspect web describes how the inner figures speak to one another. Here the supplied pattern is: ${aspectFacts}. Hard aspects such as squares, oppositions, and conjunctions are treated as integration work: not punishment, but pressure asking for consciousness. Grace aspects such as trines and sextiles are treated as channels: not laziness, but gifts that must be used on purpose. The chart becomes richer when each relationship is read as a conversation between forces.`,
        `Instruction: interpret aspects as relationships between planets. Name the planets, name the aspect, then teach what kind of relationship it creates. The supplied aspect facts are: ${aspectFacts}.`,
        `The force is relationship. ${tensionBasis.length ? `The integration tensions include ${tensionBasis.join("; ")}.` : "No hard integration tension was supplied."} ${graceBasis.length ? `The grace channels include ${graceBasis.join("; ")}.` : "No grace channel was supplied."}`,
        "Imagine threads stretched between the rooms of the inner house. Some threads are silk, some iron, some hot wire. The point is not to cut them. The point is to learn which thread carries music, which carries warning, and which becomes a bridge after enough patient crossings.",
        "Two neighbors shared a narrow bridge. One crossed at dawn with bread, the other at dusk with tools, and each accused the other of blocking the way. A teacher told them to build a bell at the center. From then on, the bridge did not remove tension; it taught timing.",
        "For each hard aspect, name both needs before choosing. For each grace aspect, schedule one deliberate use of the ease so the gift does not remain ornamental.",
        "Which inner conversation has been asking to become a bridge instead of a battlefield?",
        aspectBasisList.length ? aspectBasisList : fallbackBasis,
        [
          ...analysis.integrationTensions.flatMap((item) => item.sourceBasis),
          ...analysis.graceChannels.flatMap((item) => item.sourceBasis),
          ...provenanceBasis
        ],
        "Map one aspect as two voices, then write the one sentence that lets both be partly true.",
        fallbackBasis
      ),
      section(
        "Direct Inspiration",
        `${asc ? `${asc.key} in ${asc.sign}` : "The presentation pattern"} sets the threshold, and ${basisText(
          inspirationBasis
        )} shows how insight becomes language. Return to simple words before making the signal grand; the truest vibration should become kinder, clearer, and more practical when it enters speech.`,
        `Instruction: teach how inspiration enters the person through presentation, language, study, and future-signal markers. ${asc ? `The Ascendant is ${asc.sign}, so the doorway style begins there.` : "When no Ascendant is available, avoid claiming a rising style and focus on Mercury/Uranus/3rd/9th-house material."}`,
        "The force is reception: inspiration wants a clean channel, but the channel must be tested by humility, usefulness, and love.",
        "Picture a messenger arriving at dawn with a sealed letter from the inner sky. The letter is real, but it still has to be opened slowly, read accurately, and carried into the village without drama.",
        "A messenger once ran so fast with a holy letter that the ink blurred before anyone could read it. The second time, the messenger walked, breathed, and kept the page dry. The miracle was not slower; it was legible.",
        "Write the inspiration in one plain sentence. Then ask what action would make it kinder, clearer, and more useful by nightfall.",
        "What signal keeps returning because it is waiting for you to become simple enough to receive it?",
        inspirationBasis,
        [...map.inspirationGate.sourceBasis, ...provenanceBasis],
        "Capture the spark in one sentence, then test it through one concrete practice.",
        fallbackBasis
      )
    ],
    internalMap: {
      root: guideNode("root", map.root, fallbackBasis, sourceProvenance, concepts),
      bodyTemple: guideNode("bodyTemple", map.bodyTemple, fallbackBasis, sourceProvenance, concepts),
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
        `Instruction: use the root signatures to teach instinct, belonging, memory, home, and emotional regulation. The relevant chart basis is ${rootBasis.join("; ")}.`,
        "The force is embodiment: the chart becomes trustworthy when its insight can live in breath, timing, food, rest, attention, and honest limits.",
        "The root is a garden gate. Mystery may bloom above it, but the hinge still needs oil, the path still needs clearing, and the hand still has to open what it asks to enter.",
        "A gardener prayed for fruit and was told to water the roots. The gardener wanted a vision, but the instruction was mud, patience, and return. By harvest, the gardener understood that roots are not less mystical because they are hidden.",
        "Treat the body as the first altar. Regulate before interpreting; name the sensation before naming the story.",
        "What wisdom becomes available only after you return to the ground?",
        rootBasis,
        [...map.root.sourceBasis, ...provenanceBasis],
        map.root.practice,
        fallbackBasis
      ),
      section(
        "Body Temple Practice",
        `Work with ${bodyBasis.join("; ")} as the daily altar of the chart. The mystical life is not proved by intensity alone; it is proved by whether the signal can survive breakfast, sleep, money, work, and the ordinary hour. Capacity is a sacred fact, not a failure of devotion.`,
        `Instruction: read 2nd- and 6th-house signatures, along with embodied placements, as the chart's teaching about capacity, resources, work rhythm, and care. The relevant chart basis is ${bodyBasis.join("; ")}.`,
        "The force is rhythm: inspiration needs a vessel, and the vessel is built from repeated care, honest limits, and bodily timing.",
        "The body is the small monastery that travels with you. Its bells are hunger, fatigue, pleasure, tension, and breath. Ignore the bells and the temple grows noisy; answer them with respect and the whole chart becomes easier to hear.",
        "A student asked how to hear heaven. The teacher handed them a broom, a bowl of soup, and a bedtime. The student was offended until the noise inside them grew quiet enough to hear the next true sentence.",
        "Track energy before adding commitments. Choose one rhythm that would make the rest of the chart easier to live.",
        "What would your chart become if your body believed you were on its side?",
        bodyBasis,
        [...map.bodyTemple.sourceBasis, ...provenanceBasis],
        map.bodyTemple.practice,
        fallbackBasis
      ),
      section(
        "Shadow Practice",
        `Work with ${shadowBasis.join("; ")} without fear. The task is not to defeat the shadow, but to forgive what defended you and choose a cleaner response. Pressure becomes wisdom when it is met without worshiping it.`,
        `Instruction: teach Saturn, Mars, hard aspects, 8th/12th-house signatures, and South Node material as pressure points for repair. The relevant chart basis is ${shadowBasis.join("; ")}.`,
        "The force is transmutation: a defensive pattern becomes a teacher when it is neither obeyed nor shamed.",
        "This is the cave where the old guard stands with a lantern and a locked chest. The guard looks frightening until you realize it has been waiting for instructions from the adult self.",
        "A person found a guard at the cave mouth and called it an enemy. But the guard had stood there since childhood, keeping a younger self alive. When thanked and given a new post, the guard became courage.",
        "When the pressure rises, pause long enough to ask what the pattern is protecting. Thank the protection, then choose the cleaner response.",
        "Which guarded place in you is ready to become strength without becoming armor?",
        shadowBasis,
        [...map.shadowGate.sourceBasis, ...provenanceBasis],
        map.shadowGate.practice,
        fallbackBasis
      ),
      section(
        "Aspect Integration Practice",
        `Return to the aspect web: ${aspectFacts}. Every aspect is a relationship practice. A square asks for strength without war. An opposition asks for room enough to hold both ends. A conjunction asks for discernment because two forces share one chamber. A trine or sextile asks that ease become service instead of sleep.`,
        `Instruction: make the aspect practical by letting each planet speak for a need, then identifying the aspect as the style of negotiation. The supplied aspect facts are: ${aspectFacts}.`,
        "The force is dialogue: the chart matures when the inner voices learn timing, proportion, and honorable exchange.",
        "Think of the aspects as bridges between towers. Some bridges sway in wind; some are wide and sunlit. A bridge is not judged by whether it feels easy. It is judged by whether it can carry truth across the gap.",
        "Two towers sent signals by fire but never walked the bridge between them. One night the bridge shook, and each tower thought the other was attacking. At dawn they found the bridge had been asking for repair, not war.",
        "Choose one aspect and give each planet a clean sentence. Then write the third sentence: the bridge they can build together.",
        "Which two forces in you are ready to stop arguing and start carrying one another's wisdom?",
        aspectBasisList.length ? aspectBasisList : fallbackBasis,
        [
          ...analysis.integrationTensions.flatMap((item) => item.sourceBasis),
          ...analysis.graceChannels.flatMap((item) => item.sourceBasis),
          ...provenanceBasis
        ],
        "Let each planet in one aspect speak for one minute, then answer with one integrative action.",
        fallbackBasis
      ),
      section(
        "Service Practice",
        `Let ${serviceBasis.join("; ")} serve something real. Ask what contribution can be offered without turning usefulness into self-worth. This is the practical altar: a loving action that makes the inner pattern visible.`,
        `Instruction: read Sun, chart ruler, MC, and 10th-house signatures as the service line of the chart. The relevant chart basis is ${serviceBasis.join("; ")}.`,
        "The force is offering: the birth chart ripens when personal pattern becomes useful care, craft, truth, or protection in the world.",
        "Imagine carrying a small loaf from the inner temple to the common table. Its holiness is proven not by how rare it looks, but by whether it feeds someone.",
        "A teacher blessed a loaf and broke it into ordinary pieces. The students expected thunder, but the miracle was that everyone had enough to keep walking. Service is often the sacred becoming edible.",
        "Choose one service that is small enough to complete and honest enough to matter. Let usefulness be an expression of love, not a demand for identity.",
        "What gift becomes more yours when you give it without abandoning yourself?",
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
    maxTokens: 5200,
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
        maxTokens: 5200,
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
