import {
  PLANETS,
  OPTIONAL_POINTS,
  type AstroEngine,
  type ChartInput,
  type ChartOptions,
  type ChartPoint,
  type NatalChart,
  computeHouses,
  degreeToSign,
  degreeToSignDegree,
  detectAspects,
  normalizeDegree,
  houseForDegree
} from "@astro/astro-core";
import { toJulianDay, toUtcDate } from "@astro/utils";

const J2000 = 2451545.0;

const BASE_LONGITUDES: Record<string, number> = {
  Sun: 280.466,
  Moon: 218.316,
  Mercury: 174.796,
  Venus: 50.416,
  Mars: 19.373,
  Jupiter: 238.929,
  Saturn: 266.564,
  Uranus: 244.197,
  Neptune: 84.176,
  Pluto: 14.53,
  NorthNode: 125.044,
  Chiron: 209.0
};

const PERIOD_DAYS: Record<string, number> = {
  Sun: 365.256,
  Moon: 27.321,
  Mercury: 87.969,
  Venus: 224.701,
  Mars: 686.98,
  Jupiter: 4332.59,
  Saturn: 10759.22,
  Uranus: 30688.5,
  Neptune: 60182,
  Pluto: 90560,
  NorthNode: -6798.38,
  Chiron: 18614.8
};

const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

const meanObliquity = (jd: number): number => {
  const t = (jd - 2451545.0) / 36525;
  return 23.439291 - 0.0130042 * t;
};

const greenwichSiderealTime = (jd: number): number => {
  const t = (jd - 2451545.0) / 36525;
  const theta =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  return normalizeDegree(theta);
};

const localSiderealTime = (jd: number, longitude: number): number => {
  return normalizeDegree(greenwichSiderealTime(jd) + longitude);
};

const computeAscendant = (jd: number, latitude: number, longitude: number): number => {
  const lst = degToRad(localSiderealTime(jd, longitude));
  const eps = degToRad(meanObliquity(jd));
  const phi = degToRad(latitude);

  const numerator = -Math.cos(lst);
  const denominator = Math.sin(lst) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps);
  const lambda = Math.atan2(numerator, denominator);
  return normalizeDegree(radToDeg(lambda));
};

const computeMidheaven = (jd: number, longitude: number): number => {
  const lst = degToRad(localSiderealTime(jd, longitude));
  const eps = degToRad(meanObliquity(jd));
  const lambda = Math.atan2(Math.sin(lst), Math.cos(lst) * Math.cos(eps));
  return normalizeDegree(radToDeg(lambda));
};

const calcLongitude = (body: string, jd: number): number => {
  const base = BASE_LONGITUDES[body] ?? 0;
  const period = PERIOD_DAYS[body] ?? 365.25;
  const days = jd - J2000;
  const dir = period < 0 ? -1 : 1;
  const orbit = 360 * (days / Math.abs(period)) * dir;
  return normalizeDegree(base + orbit);
};

const isRetrograde = (body: string, jd: number): boolean => {
  const prev = calcLongitude(body, jd - 1);
  const next = calcLongitude(body, jd + 1);
  const diff = normalizeDegree(next - prev);
  return diff > 180;
};

const buildPoint = (key: string, type: ChartPoint["type"], degree: number, retrograde?: boolean): ChartPoint => {
  const normalized = normalizeDegree(degree);
  return {
    key,
    type,
    degree: normalized,
    sign: degreeToSign(normalized),
    signDegree: degreeToSignDegree(normalized),
    retrograde
  };
};

export class AstronomyEngineEngine implements AstroEngine {
  id = "astronomy-engine";

  async calculateChart(input: ChartInput, options: ChartOptions = {}): Promise<NatalChart> {
    const timeUnknown = Boolean(input.timeUnknown);
    const houseSystem = options.houseSystem ?? "placidus";
    const dateUTC = toUtcDate(input.birthDate, input.birthTime, input.timeUnknown, input.timezone);
    const jd = toJulianDay(dateUTC);

    const points: ChartPoint[] = [];
    for (const planet of PLANETS) {
      const degree = calcLongitude(planet, jd);
      points.push(buildPoint(planet, "planet", degree, isRetrograde(planet, jd)));
    }

    if (options.includePoints?.northNode) {
      const degree = calcLongitude("NorthNode", jd);
      points.push(buildPoint("NorthNode", "point", degree, isRetrograde("NorthNode", jd)));
    }

    if (options.includePoints?.chiron) {
      const degree = calcLongitude("Chiron", jd);
      points.push(buildPoint("Chiron", "point", degree, isRetrograde("Chiron", jd)));
    }

    let houses;
    if (!timeUnknown) {
      const asc = computeAscendant(jd, input.latitude, input.longitude);
      const mc = computeMidheaven(jd, input.longitude);
      houses = computeHouses(houseSystem, asc, mc);

      points.push(buildPoint("Asc", "angle", asc));
      points.push(buildPoint("MC", "angle", mc));

      const cusps = houses.cusps;
      for (const point of points) {
        if (point.type === "angle") continue;
        point.house = houseForDegree(point.degree, cusps);
      }
    }

    const aspects = detectAspects(points.filter((p) => p.type !== "angle"));

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
        houseSystem: timeUnknown ? undefined : houseSystem
      }
    };
  }
}

export const createAstronomyEngine = (): AstroEngine => new AstronomyEngineEngine();
