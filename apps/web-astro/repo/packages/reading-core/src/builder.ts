import type { NatalChart, ChartPoint, ZodiacSign } from "@astro/astro-core";
import type { BrandConfig } from "@astro/brands";

type Element = "Fire" | "Earth" | "Air" | "Water";
type Modality = "Cardinal" | "Fixed" | "Mutable";

const ELEMENT_ORDER: Element[] = ["Fire", "Earth", "Air", "Water"];
const MODALITY_ORDER: Modality[] = ["Cardinal", "Fixed", "Mutable"];

const ELEMENT_BY_SIGN: Record<ZodiacSign, Element> = {
  Aries: "Fire",
  Taurus: "Earth",
  Gemini: "Air",
  Cancer: "Water",
  Leo: "Fire",
  Virgo: "Earth",
  Libra: "Air",
  Scorpio: "Water",
  Sagittarius: "Fire",
  Capricorn: "Earth",
  Aquarius: "Air",
  Pisces: "Water"
};

const MODALITY_BY_SIGN: Record<ZodiacSign, Modality> = {
  Aries: "Cardinal",
  Taurus: "Fixed",
  Gemini: "Mutable",
  Cancer: "Cardinal",
  Leo: "Fixed",
  Virgo: "Mutable",
  Libra: "Cardinal",
  Scorpio: "Fixed",
  Sagittarius: "Mutable",
  Capricorn: "Cardinal",
  Aquarius: "Fixed",
  Pisces: "Mutable"
};

const RULER_BY_SIGN: Record<ZodiacSign, string> = {
  Aries: "Mars",
  Taurus: "Venus",
  Gemini: "Mercury",
  Cancer: "Moon",
  Leo: "Sun",
  Virgo: "Mercury",
  Libra: "Venus",
  Scorpio: "Mars/Pluto",
  Sagittarius: "Jupiter",
  Capricorn: "Saturn",
  Aquarius: "Saturn/Uranus",
  Pisces: "Jupiter/Neptune"
};

const summarizeCounts = <T extends string>(counts: Record<T, number>, order: T[]): string => {
  return order.map((key) => `${key} ${counts[key] ?? 0}`).join(", ");
};

const dominantFromCounts = <T extends string>(counts: Record<T, number>, order: T[]): T[] => {
  const values = order.map((key) => counts[key] ?? 0);
  const max = Math.max(...values);
  if (!Number.isFinite(max) || max <= 0) return [];
  return order.filter((key) => (counts[key] ?? 0) === max);
};

const placement = (point?: ChartPoint): string => {
  if (!point) return "";
  const house = point.house ? `, House ${point.house}` : "";
  const retrograde = point.retrograde ? " (retrograde)" : "";
  return `${point.key} in ${point.sign} ${point.signDegree.toFixed(1)}°${house}${retrograde}`;
};

export const buildChartFacts = (chart: NatalChart) => {
  const find = (key: string) => chart.points.find((p) => p.key === key);
  const sun = find("Sun");
  const moon = find("Moon");
  const rising = find("Asc");

  const planetPoints = chart.points.filter((p) => p.type === "planet");
  const elementCounts = planetPoints.reduce<Record<Element, number>>((acc, point) => {
    const element = ELEMENT_BY_SIGN[point.sign];
    acc[element] = (acc[element] ?? 0) + 1;
    return acc;
  }, { Fire: 0, Earth: 0, Air: 0, Water: 0 });

  const modalityCounts = planetPoints.reduce<Record<Modality, number>>((acc, point) => {
    const modality = MODALITY_BY_SIGN[point.sign];
    acc[modality] = (acc[modality] ?? 0) + 1;
    return acc;
  }, { Cardinal: 0, Fixed: 0, Mutable: 0 });

  const placements = chart.points
    .filter((p) => p.type !== "angle")
    .map((p) => placement(p));

  const aspects = chart.aspects.slice(0, 6).map((aspect) => {
    return `${aspect.between.join(" & ")} ${aspect.type} (orb ${aspect.orb.toFixed(1)}°)`;
  });

  return {
    timeUnknown: chart.meta.timeUnknown,
    elementCounts,
    modalityCounts,
    dominantElements: dominantFromCounts(elementCounts, ELEMENT_ORDER),
    dominantModalities: dominantFromCounts(modalityCounts, MODALITY_ORDER),
    chartRuler: rising ? RULER_BY_SIGN[rising.sign] : undefined,
    bigThree: {
      sun: placement(sun),
      moon: placement(moon),
      rising: rising ? placement(rising) : undefined
    },
    placements,
    aspects,
    houses: chart.houses?.cusps.map((cusp, index) => `House ${index + 1}: ${cusp.toFixed(1)}°`) ?? []
  };
};

export const chartFactsToString = (chart: NatalChart, brand: BrandConfig): string => {
  const facts = buildChartFacts(chart);
  return [
    `Time unknown: ${facts.timeUnknown}`,
    facts.chartRuler ? `Chart ruler (Ascendant): ${facts.chartRuler}` : "",
    `Big Three: ${[facts.bigThree.sun, facts.bigThree.moon, facts.bigThree.rising]
      .filter(Boolean)
      .join(" | ")}`,
    `Element balance: ${summarizeCounts(facts.elementCounts, ELEMENT_ORDER)}${
      facts.dominantElements.length ? ` (dominant: ${facts.dominantElements.join(", ")})` : ""
    }`,
    `Modality balance: ${summarizeCounts(facts.modalityCounts, MODALITY_ORDER)}${
      facts.dominantModalities.length ? ` (dominant: ${facts.dominantModalities.join(", ")})` : ""
    }`,
    `Placements: ${facts.placements.join("; ")}`,
    `Aspects: ${facts.aspects.join("; ")}`,
    facts.houses.length ? `House cusps: ${facts.houses.join("; ")}` : "",
    `Brand lens: ${brand.focusModules.map((module) => module.title).join(", ")}`
  ]
    .filter(Boolean)
    .join("\n");
};
