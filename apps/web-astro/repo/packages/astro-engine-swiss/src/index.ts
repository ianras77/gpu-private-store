import path from "node:path";
import { createRequire } from "node:module";
import {
  type AstroEngine,
  type ChartInput,
  type ChartOptions,
  type ChartPoint,
  type NatalChart,
  type HouseInfo,
  computeHouses,
  degreeToSign,
  degreeToSignDegree,
  detectAspects,
  houseForDegree,
  normalizeDegree
} from "@astro/astro-core";
import { toJulianDay, toUtcDate } from "@astro/utils";

type SwissEphemeris = typeof import("swisseph");

const require = createRequire(import.meta.url);

const PLANET_DEFS = [
  { key: "Sun", swissephId: "SE_SUN" },
  { key: "Moon", swissephId: "SE_MOON" },
  { key: "Mercury", swissephId: "SE_MERCURY" },
  { key: "Venus", swissephId: "SE_VENUS" },
  { key: "Mars", swissephId: "SE_MARS" },
  { key: "Jupiter", swissephId: "SE_JUPITER" },
  { key: "Saturn", swissephId: "SE_SATURN" },
  { key: "Uranus", swissephId: "SE_URANUS" },
  { key: "Neptune", swissephId: "SE_NEPTUNE" },
  { key: "Pluto", swissephId: "SE_PLUTO" }
] as const;

const OPTIONAL_POINT_DEFS = {
  NorthNode: { key: "NorthNode", swissephId: "SE_TRUE_NODE" },
  Chiron: { key: "Chiron", swissephId: "SE_CHIRON" }
} as const;

type BodyDef = {
  key: string;
  swissephId: keyof SwissEphemeris;
};

type CalcLongitudeResult = {
  longitude: number;
  longitudeSpeed: number;
};

type CalcResult = ReturnType<SwissEphemeris["swe_calc_ut"]>;
type HousesResult = ReturnType<SwissEphemeris["swe_houses"]>;
type ErrorResult = { error: string };

let swissCache: SwissEphemeris | null = null;
let ephemerisPathConfigured = false;

const readEnv = (): Record<string, string | undefined> => {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
};

const disabledByEnv = (): boolean => {
  const raw = readEnv().SWISS_EPHEMERIS_ENABLED?.trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "no";
};

const defaultEphemerisPath = (): string | null => {
  try {
    const pkgPath = require.resolve("swisseph/package.json");
    return path.join(path.dirname(pkgPath), "ephe");
  } catch {
    return null;
  }
};

const configureEphemerisPath = (swiss: SwissEphemeris): void => {
  if (ephemerisPathConfigured) return;
  const envPath = readEnv().SWISS_EPHEMERIS_PATH?.trim();
  const resolvedPath = envPath && envPath.length > 0 ? envPath : defaultEphemerisPath();
  if (resolvedPath) {
    swiss.swe_set_ephe_path(resolvedPath);
  }
  ephemerisPathConfigured = true;
};

const loadSwissEphemeris = (): SwissEphemeris => {
  if (swissCache) return swissCache;
  try {
    const swiss = require("swisseph") as SwissEphemeris;
    configureEphemerisPath(swiss);
    swissCache = swiss;
    return swiss;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load swisseph native bindings: ${message}. Swiss Ephemeris is dual-licensed (AGPL/commercial).`
    );
  }
};

const isErrorResult = (result: CalcResult | HousesResult): result is ErrorResult => {
  return "error" in result && typeof result.error === "string";
};

const asLongitudeResult = (result: CalcResult): CalcLongitudeResult | null => {
  if ("longitude" in result && typeof result.longitude === "number" && typeof result.longitudeSpeed === "number") {
    return {
      longitude: result.longitude,
      longitudeSpeed: result.longitudeSpeed
    };
  }
  return null;
};

const bodyIdFromDef = (swiss: SwissEphemeris, body: BodyDef): number => {
  const id = swiss[body.swissephId];
  if (typeof id !== "number") {
    throw new Error(`Invalid Swiss body id for ${body.key}`);
  }
  return id;
};

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

const calcBody = (
  swiss: SwissEphemeris,
  jd: number,
  body: BodyDef
): { degree: number; retrograde: boolean; speed: number } => {
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

const mapPlacidusHouses = (rawCusps: number[], asc: number, mc: number): HouseInfo => {
  if (rawCusps.length < 12) {
    throw new Error("Swiss Ephemeris returned incomplete house cusps.");
  }
  return {
    system: "placidus",
    cusps: rawCusps.slice(0, 12).map((cusp) => normalizeDegree(cusp)),
    ascendant: normalizeDegree(asc),
    descendant: normalizeDegree(asc + 180),
    midheaven: normalizeDegree(mc),
    imumCoeli: normalizeDegree(mc + 180)
  };
};

export class SwissEphemerisEngine implements AstroEngine {
  id = "swiss-ephemeris";

  async calculateChart(input: ChartInput, options: ChartOptions = {}): Promise<NatalChart> {
    if (disabledByEnv()) {
      throw new Error(
        "Swiss Ephemeris engine is disabled by SWISS_EPHEMERIS_ENABLED. Set it to true (or unset it) to enable."
      );
    }

    const swiss = loadSwissEphemeris();
    const timeUnknown = Boolean(input.timeUnknown);
    const houseSystem = options.houseSystem ?? "placidus";
    const dateUTC = toUtcDate(input.birthDate, input.birthTime, input.timeUnknown, input.timezone);
    const jd = toJulianDay(dateUTC);

    const points: ChartPoint[] = [];

    for (const body of PLANET_DEFS) {
      const result = calcBody(swiss, jd, body);
      points.push(buildPoint(body.key, "planet", result.degree, result.retrograde, result.speed));
    }

    if (options.includePoints?.northNode) {
      const result = calcBody(swiss, jd, OPTIONAL_POINT_DEFS.NorthNode);
      points.push(buildPoint("NorthNode", "point", result.degree, result.retrograde, result.speed));
    }

    if (options.includePoints?.chiron) {
      const result = calcBody(swiss, jd, OPTIONAL_POINT_DEFS.Chiron);
      points.push(buildPoint("Chiron", "point", result.degree, result.retrograde, result.speed));
    }

    let houses: HouseInfo | undefined;

    if (!timeUnknown) {
      const rawHouses = swiss.swe_houses(jd, input.latitude, input.longitude, "P");
      if (isErrorResult(rawHouses)) {
        throw new Error(`Swiss Ephemeris house calculation failed: ${rawHouses.error}`);
      }

      const asc = normalizeDegree(rawHouses.ascendant);
      const mc = normalizeDegree(rawHouses.mc);
      const desc = normalizeDegree(asc + 180);
      const ic = normalizeDegree(mc + 180);

      houses =
        houseSystem === "whole-sign"
          ? computeHouses("whole-sign", asc, mc)
          : mapPlacidusHouses(rawHouses.house, asc, mc);
      houses = {
        ...houses,
        ascendant: asc,
        descendant: desc,
        midheaven: mc,
        imumCoeli: ic
      };

      points.push(buildPoint("Asc", "angle", asc));
      points.push(buildPoint("MC", "angle", mc));
      points.push(buildPoint("Desc", "angle", desc));
      points.push(buildPoint("IC", "angle", ic));

      for (const point of points) {
        if (point.type === "angle") continue;
        point.house = houseForDegree(point.degree, houses.cusps);
      }
    }

    const aspects = detectAspects(points.filter((point) => point.type !== "angle"));

    return {
      points,
      aspects,
      houses,
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
    };
  }
}

export const createSwissEngine = (): AstroEngine => new SwissEphemerisEngine();
