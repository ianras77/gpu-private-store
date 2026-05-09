import type { AstroEngine, NatalChart, ChartPoint } from "@astro/astro-core";
import { detectAspects, shortestArc } from "@astro/astro-core";
import { getEngine } from "./engine";

const TRANSIT_PLANETS = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
const NATAL_TARGETS = ["Sun", "Moon", "Asc", "MC", "Venus", "Mars"];

const normalizeDate = (date: Date): string => date.toISOString().slice(0, 10);

const buildTransitPoints = (chart: NatalChart): ChartPoint[] => {
  return chart.points
    .filter((point) => point.type === "planet")
    .map((point) => ({
      ...point,
      key: `T:${point.key}`
    }));
};

const buildNatalPoints = (chart: NatalChart): ChartPoint[] => {
  return chart.points
    .filter((point) => point.type !== "point")
    .map((point) => ({
      ...point,
      key: `N:${point.key}`
    }));
};

const formatAspect = (aspect: { between: [string, string]; type: string; orb: number }) => {
  const clean = (value: string) => value.replace(/^N:|^T:/, "");
  return `${clean(aspect.between[0])} ${aspect.type} ${clean(aspect.between[1])} (orb ${aspect.orb.toFixed(1)}°)`;
};

export const buildRitualCalendarFacts = async (
  natal: NatalChart,
  days = 7,
  engine?: AstroEngine
): Promise<string> => {
  const astroEngine = engine ?? getEngine();
  const today = new Date();
  const natalPoints = buildNatalPoints(natal).filter((point) => NATAL_TARGETS.includes(point.key.replace("N:", "")));
  const lines: string[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i, 12, 0, 0));
    const birthDate = normalizeDate(date);
    const chart = await astroEngine.calculateChart({
      birthDate,
      birthTime: "12:00",
      timeUnknown: true,
      latitude: 0,
      longitude: 0,
      timezone: "UTC"
    });
    const moon = chart.points.find((point) => point.key === "Moon");
    const transitPoints = buildTransitPoints(chart).filter((point) =>
      TRANSIT_PLANETS.includes(point.key.replace("T:", ""))
    );
    const crossAspects = detectAspects([...transitPoints, ...natalPoints])
      .filter((aspect) => {
        const a = aspect.between[0];
        const b = aspect.between[1];
        return (a.startsWith("T:") && b.startsWith("N:")) || (a.startsWith("N:") && b.startsWith("T:"));
      })
      .sort((a, b) => a.orb - b.orb)
      .slice(0, 2);

    const aspectText = crossAspects.length ? crossAspects.map(formatAspect).join("; ") : "No major aspects highlighted.";
    const moonText = moon ? `Moon in ${moon.sign} ${moon.signDegree.toFixed(1)}°` : "Moon position unavailable.";
    lines.push(`${birthDate}: ${moonText}. Key transits: ${aspectText}`);
  }

  return lines.join("\n");
};
