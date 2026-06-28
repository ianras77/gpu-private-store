import type { Aspect, ChartPoint, NatalChart, ZodiacSign } from "@astro/astro-core";
import type { ChartAnalysis, MapNode, MapPath } from "./types";

type InternalMap = ChartAnalysis["internalMap"];

const SIGN_RULERS: Record<ZodiacSign, string> = {
  Aries: "Mars",
  Taurus: "Venus",
  Gemini: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Virgo: "Mercury",
  Libra: "Venus",
  Scorpio: "Pluto",
  Sagittarius: "Jupiter",
  Capricorn: "Saturn",
  Aquarius: "Uranus",
  Pisces: "Neptune"
};

const HARD_ASPECTS = new Set<Aspect["type"]>(["conjunction", "opposition", "square"]);

export const placement = (point: ChartPoint): string => {
  const house = point.house ? `, House ${point.house}` : "";
  return `${point.key} in ${point.sign}${house}`;
};

export const aspectBasis = (aspect: Aspect): string => {
  const [first, second] = aspect.between;
  return `${first} & ${second} ${aspect.type}`;
};

const hasHouse = (point: ChartPoint, houses: readonly number[]): boolean =>
  point.house !== undefined && houses.includes(point.house);

const unique = (values: string[]): string[] => Array.from(new Set(values));

const pointBases = (
  points: readonly ChartPoint[],
  predicate: (point: ChartPoint) => boolean
): string[] => unique(points.filter(predicate).map(placement));

const aspectBases = (
  aspects: readonly Aspect[],
  predicate: (aspect: Aspect) => boolean
): string[] => unique(aspects.filter(predicate).map(aspectBasis));

const node = (
  name: string,
  theme: string,
  gift: string,
  distortion: string,
  practice: string,
  mantra: string,
  chartBasis: string[],
  sourceBasis: string[]
): MapNode => ({
  name,
  theme,
  gift,
  distortion,
  practice,
  mantra,
  chartBasis: unique(chartBasis),
  sourceBasis
});

const ascendant = (points: readonly ChartPoint[]): ChartPoint | undefined =>
  points.find((point) => point.key === "Asc");

const chartRulerKey = (points: readonly ChartPoint[]): string | undefined => {
  const asc = ascendant(points);
  return asc ? SIGN_RULERS[asc.sign] : undefined;
};

const isChartRuler = (point: ChartPoint, rulerKey: string | undefined): boolean =>
  rulerKey !== undefined && point.key === rulerKey;

const isHardAspect = (aspect: Aspect): boolean => HARD_ASPECTS.has(aspect.type);

const isShadowAspect = (aspect: Aspect): boolean =>
  isHardAspect(aspect) ||
  aspect.between.some((key) => key === "Saturn" || key === "Mars" || key === "SouthNode");

const buildPaths = (aspects: readonly Aspect[]): MapPath[] =>
  aspects.map((aspect) => {
    const [from, to] = aspect.between;
    const hard = isHardAspect(aspect);

    return {
      from,
      to,
      tension: hard ? `${aspect.type} asks for conscious integration` : `${aspect.type} supports flow`,
      medicine: hard ? "Slow down, name both needs, and choose one grounded next action." : "Use the ease deliberately.",
      practice: hard ? "Pause before reacting." : "Rehearse the natural strength.",
      chartBasis: [aspectBasis(aspect)],
      sourceBasis: [`${aspect.type} aspect, orb ${aspect.orb}, exact ${aspect.exact}`]
    };
  });

export const buildInternalMap = (chart: NatalChart): InternalMap => {
  const { points, aspects } = chart;
  const rulerKey = chartRulerKey(points);
  const rootBasis = pointBases(
    points,
    (point) => point.key === "Moon" || point.key === "IC" || hasHouse(point, [4])
  );
  const heartBasis = pointBases(
    points,
    (point) => point.key === "Venus" || hasHouse(point, [5, 7])
  );
  const voiceBasis = pointBases(
    points,
    (point) => point.key === "Mercury" || point.key === "Uranus" || hasHouse(point, [3, 9])
  );
  const crownBasis = pointBases(
    points,
    (point) => point.key === "Sun" || point.key === "MC" || isChartRuler(point, rulerKey) || hasHouse(point, [10])
  );
  const shadowBasis = [
    ...pointBases(
      points,
      (point) =>
        point.key === "Saturn" ||
        point.key === "Mars" ||
        point.key === "SouthNode" ||
        hasHouse(point, [8, 12])
    ),
    ...aspectBases(aspects, isShadowAspect)
  ];
  const serviceBasis = crownBasis;
  const inspirationBasis = voiceBasis;

  return {
    root: node(
      "Root",
      "belonging and instinct",
      "emotional truth",
      "defensive retreat",
      "Name the need before solving it.",
      "I can be steady with what I feel.",
      rootBasis,
      ["Moon, IC, and 4th-house placements"]
    ),
    bodyTemple: node(
      "Body Temple",
      "daily care and capacity",
      "sustainable rhythm",
      "overriding limits",
      "Track energy before adding commitments.",
      "My pace is part of the path.",
      pointBases(points, (point) => hasHouse(point, [2, 6])),
      ["2nd- and 6th-house placements"]
    ),
    heartChamber: node(
      "Heart Chamber",
      "affection and reciprocity",
      "generous connection",
      "performing for approval",
      "Offer warmth with a clear boundary.",
      "Love works best when it stays honest.",
      heartBasis,
      ["Venus, 5th-house, and 7th-house placements"]
    ),
    voiceAndMind: node(
      "Voice and Mind",
      "language, learning, and pattern",
      "clear translation",
      "scattered interpretation",
      "Say the simple version first.",
      "My mind can make the signal usable.",
      voiceBasis,
      ["Mercury, Uranus, 3rd-house, and 9th-house placements"]
    ),
    crownAndStar: node(
      "Crown and Star",
      "identity and visible direction",
      "confident presence",
      "chasing recognition",
      "Choose the role that matches the work.",
      "Visibility can serve purpose.",
      crownBasis,
      ["Sun, chart ruler, MC, and 10th-house placements"]
    ),
    shadowGate: node(
      "Shadow Gate",
      "pressure, defense, and repair",
      "disciplined courage",
      "control under stress",
      "Work the hard pattern in small reps.",
      "I can meet pressure without becoming it.",
      shadowBasis,
      ["Saturn, Mars, South Node, hard aspects, 8th-house, and 12th-house placements"]
    ),
    serviceGate: node(
      "Service Gate",
      "work offered to the world",
      "responsible contribution",
      "usefulness as self-worth",
      "Define the service before the audience.",
      "My work can be useful without consuming me.",
      serviceBasis,
      ["Sun, chart ruler, MC, and 10th-house placements"]
    ),
    inspirationGate: node(
      "Inspiration Gate",
      "insight and future signal",
      "inventive perspective",
      "restless abstraction",
      "Capture the spark, then test it in practice.",
      "Inspiration becomes real when I translate it.",
      inspirationBasis,
      ["Mercury, Uranus, 3rd-house, and 9th-house placements"]
    ),
    paths: buildPaths(aspects)
  };
};
