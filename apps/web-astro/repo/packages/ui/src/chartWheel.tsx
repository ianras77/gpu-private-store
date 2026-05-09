import React from "react";
import type { Aspect, NatalChart } from "@astro/astro-core";

const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces"
] as const;

const SIGN_SHORT: Record<(typeof ZODIAC_SIGNS)[number], string> = {
  Aries: "Ari",
  Taurus: "Tau",
  Gemini: "Gem",
  Cancer: "Can",
  Leo: "Leo",
  Virgo: "Vir",
  Libra: "Lib",
  Scorpio: "Sco",
  Sagittarius: "Sag",
  Capricorn: "Cap",
  Aquarius: "Aqu",
  Pisces: "Pis"
};

const ELEMENT_BY_SIGN: Record<(typeof ZODIAC_SIGNS)[number], "Fire" | "Earth" | "Air" | "Water"> = {
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

const ELEMENT_COLORS: Record<"Fire" | "Earth" | "Air" | "Water", string> = {
  Fire: "rgba(255, 122, 79, 0.18)",
  Earth: "rgba(123, 209, 139, 0.18)",
  Air: "rgba(123, 184, 255, 0.18)",
  Water: "rgba(139, 107, 255, 0.18)"
};

const ASPECT_COLORS: Record<string, string> = {
  conjunction: "rgba(241, 214, 172, 0.72)",
  opposition: "rgba(222, 110, 92, 0.68)",
  trine: "rgba(102, 186, 190, 0.68)",
  square: "rgba(214, 140, 92, 0.68)",
  sextile: "rgba(130, 190, 150, 0.68)"
};

const POINT_SHORT: Record<string, string> = {
  Sun: "Su",
  Moon: "Mo",
  Mercury: "Me",
  Venus: "Ve",
  Mars: "Ma",
  Jupiter: "Ju",
  Saturn: "Sa",
  Uranus: "Ur",
  Neptune: "Ne",
  Pluto: "Pl",
  Asc: "Asc",
  MC: "MC"
};

const normalizeDegree = (deg: number): number => {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
};

const shortestDegreeDistance = (a: number, b: number): number => {
  const diff = Math.abs(normalizeDegree(a) - normalizeDegree(b));
  return Math.min(diff, 360 - diff);
};

const polarToCartesian = (center: number, radius: number, angle: number) => {
  const rad = ((normalizeDegree(angle) - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(rad),
    y: center + radius * Math.sin(rad)
  };
};

const ringSegmentPath = (
  center: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) => {
  const span = normalizeDegree(endAngle - startAngle);
  const largeArc = span > 180 ? 1 : 0;

  const startOuter = polarToCartesian(center, outerRadius, startAngle);
  const endOuter = polarToCartesian(center, outerRadius, endAngle);
  const endInner = polarToCartesian(center, innerRadius, endAngle);
  const startInner = polarToCartesian(center, innerRadius, startAngle);

  return [
    `M ${startOuter.x.toFixed(3)} ${startOuter.y.toFixed(3)}`,
    `A ${outerRadius.toFixed(3)} ${outerRadius.toFixed(3)} 0 ${largeArc} 1 ${endOuter.x.toFixed(3)} ${endOuter.y.toFixed(3)}`,
    `L ${endInner.x.toFixed(3)} ${endInner.y.toFixed(3)}`,
    `A ${innerRadius.toFixed(3)} ${innerRadius.toFixed(3)} 0 ${largeArc} 0 ${startInner.x.toFixed(3)} ${startInner.y.toFixed(3)}`,
    "Z"
  ].join(" ");
};

const midpointDegree = (start: number, end: number) => {
  const span = normalizeDegree(end - start);
  return normalizeDegree(start + span / 2);
};

const aspectKey = (aspect: Aspect): string => `${aspect.between.join("-")}-${aspect.type}`;

export type ChartWheelFocusStep = "ring" | "houses" | "planets" | "aspects" | "synthesis";

export interface ChartWheelProps {
  chart: NatalChart;
  size?: number;
  focusStep?: ChartWheelFocusStep;
  highlightPlanetKey?: string;
  highlightAspectKey?: string;
}

export const ChartWheel: React.FC<ChartWheelProps> = ({
  chart,
  size = 420,
  focusStep = "synthesis",
  highlightPlanetKey,
  highlightAspectKey
}) => {
  const center = size / 2;
  const outerRadius = size / 2 - 12;
  const signBandOuter = outerRadius;
  const signBandInner = outerRadius - 26;
  const houseOuter = signBandInner - 8;
  const houseInner = size * 0.2;
  const planetOrbitBase = houseOuter - 16;

  const cusps = chart.houses?.cusps ?? Array.from({ length: 12 }, (_, i) => i * 30);

  const planetPoints = chart.points
    .filter((point) => point.type === "planet" || point.key === "Asc" || point.key === "MC")
    .sort((a, b) => a.degree - b.degree)
    .map((point, index, all) => {
      let cluster = 0;
      for (let i = index - 1; i >= 0; i -= 1) {
        const previous = all[i];
        if (!previous) break;
        if (shortestDegreeDistance(point.degree, previous.degree) > 4) break;
        cluster += 1;
      }
      const radiusOffset = Math.min(cluster, 3) * 10;
      const radius = planetOrbitBase - radiusOffset;
      const coords = polarToCartesian(center, radius, point.degree);
      return {
        point,
        radius,
        ...coords
      };
    });

  const pointMap = new Map(planetPoints.map((entry) => [entry.point.key, entry]));

  const aspectLines = (chart.aspects ?? [])
    .map((aspect) => {
      const a = pointMap.get(aspect.between[0]);
      const b = pointMap.get(aspect.between[1]);
      if (!a || !b) return null;
      return {
        aspect,
        a,
        b,
        key: aspectKey(aspect)
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const houseMidpoints = cusps.map((deg, index) => {
    const next = cusps[(index + 1) % cusps.length] ?? deg;
    return midpointDegree(deg, next);
  });

  const layerOpacity = {
    ring: focusStep === "ring" ? 1 : focusStep === "synthesis" ? 0.9 : 0.35,
    houses: focusStep === "houses" ? 1 : focusStep === "synthesis" ? 0.9 : 0.3,
    planets: focusStep === "planets" ? 1 : focusStep === "synthesis" ? 0.92 : 0.35,
    aspects: focusStep === "aspects" ? 1 : focusStep === "synthesis" ? 0.78 : 0.18
  };

  return (
    <div className="chart-wheel-wrap">
      <svg
        className="chart-wheel-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Birth chart wheel with zodiac ring, houses, planets, and aspect lines"
      >
        <defs>
          <radialGradient id="chartWheelBg" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="rgba(24, 28, 38, 0.94)" />
            <stop offset="100%" stopColor="rgba(10, 11, 16, 1)" />
          </radialGradient>
        </defs>

        <circle cx={center} cy={center} r={outerRadius} fill="url(#chartWheelBg)" stroke="rgba(241, 214, 172, 0.24)" />

        <g opacity={layerOpacity.ring}>
          {ZODIAC_SIGNS.map((sign, index) => {
            const start = index * 30;
            const end = (index + 1) * 30;
            const mid = start + 15;
            const label = polarToCartesian(center, signBandInner + 12, mid);
            return (
              <g key={`sign-${sign}`}>
                <path
                  d={ringSegmentPath(center, signBandInner, signBandOuter, start, end)}
                  fill={ELEMENT_COLORS[ELEMENT_BY_SIGN[sign]]}
                  stroke="rgba(241, 214, 172, 0.24)"
                  strokeWidth={0.8}
                />
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(241, 214, 172, 0.86)"
                  fontSize={Math.max(9, size * 0.024)}
                  style={{ letterSpacing: "0.06em", fontFamily: "var(--font-display)" }}
                >
                  {SIGN_SHORT[sign]}
                </text>
              </g>
            );
          })}
        </g>

        <g opacity={layerOpacity.houses}>
          <circle
            cx={center}
            cy={center}
            r={houseOuter}
            fill="none"
            stroke="rgba(241, 214, 172, 0.28)"
            strokeWidth={1.2}
          />
          <circle
            cx={center}
            cy={center}
            r={houseInner}
            fill="none"
            stroke="rgba(241, 214, 172, 0.22)"
            strokeWidth={1}
          />
          {cusps.map((deg, index) => {
            const outer = polarToCartesian(center, houseOuter, deg);
            const inner = polarToCartesian(center, houseInner, deg);
            return (
              <line
                key={`house-line-${index}`}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(241, 214, 172, 0.32)"
                strokeWidth={1}
              />
            );
          })}
          {houseMidpoints.map((deg, index) => {
            const pos = polarToCartesian(center, (houseInner + houseOuter) / 2, deg);
            return (
              <text
                key={`house-label-${index}`}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(241, 214, 172, 0.75)"
                fontSize={Math.max(8, size * 0.021)}
                style={{ letterSpacing: "0.08em", fontFamily: "var(--font-display)" }}
              >
                {index + 1}
              </text>
            );
          })}
        </g>

        <g opacity={layerOpacity.aspects}>
          {aspectLines.map(({ aspect, a, b, key }) => {
            const active = highlightAspectKey === key;
            const dimmed = highlightAspectKey && !active;
            return (
              <line
                key={key}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={ASPECT_COLORS[aspect.type] ?? "rgba(241, 214, 172, 0.7)"}
                strokeWidth={active ? 2 : 1.05}
                opacity={dimmed ? 0.22 : active ? 1 : 0.8}
              />
            );
          })}
        </g>

        <g opacity={layerOpacity.planets}>
          {planetPoints.map(({ point, x, y }) => {
            const active = point.key === highlightPlanetKey;
            const dimmed = highlightPlanetKey && !active;
            const isAngle = point.key === "Asc" || point.key === "MC";
            const r = isAngle ? Math.max(8, size * 0.021) : Math.max(7, size * 0.019);

            return (
              <g key={point.key} opacity={dimmed ? 0.25 : 1}>
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={isAngle ? "rgba(241, 214, 172, 0.2)" : "rgba(241, 214, 172, 0.95)"}
                  stroke={isAngle ? "rgba(241, 214, 172, 0.95)" : "rgba(17, 18, 24, 0.92)"}
                  strokeWidth={active ? 2.4 : 1.4}
                />
                <text
                  x={x}
                  y={y + 0.2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isAngle ? "rgba(241, 214, 172, 0.95)" : "rgba(17, 18, 24, 0.95)"}
                  fontSize={Math.max(7.2, size * 0.017)}
                  style={{ letterSpacing: "0.01em", fontFamily: "var(--font-display)" }}
                >
                  {POINT_SHORT[point.key] ?? point.key.slice(0, 2)}
                </text>
              </g>
            );
          })}
        </g>

        <g>
          <circle
            cx={center}
            cy={center}
            r={Math.max(24, size * 0.07)}
            fill="rgba(241, 214, 172, 0.08)"
            stroke="rgba(241, 214, 172, 0.26)"
          />
          <text
            x={center}
            y={center - 4}
            textAnchor="middle"
            fill="rgba(241, 214, 172, 0.84)"
            fontSize={Math.max(8.5, size * 0.02)}
            style={{ letterSpacing: "0.12em", fontFamily: "var(--font-display)" }}
          >
            BIRTH
          </text>
          <text
            x={center}
            y={center + 8}
            textAnchor="middle"
            fill="rgba(241, 214, 172, 0.66)"
            fontSize={Math.max(7.8, size * 0.018)}
            style={{ letterSpacing: "0.12em", fontFamily: "var(--font-display)" }}
          >
            MAP
          </text>
        </g>
      </svg>
    </div>
  );
};
