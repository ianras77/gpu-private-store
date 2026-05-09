"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell, Section, Heading, Text, Button, Card, ChartWheel } from "@astro/ui";
import { loadAuthSession, loadChart } from "../../lib/storage";
import { brandCopy } from "../../lib/brand";

const PLANET_ORDER = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto"
];

const ELEMENT_BY_SIGN: Record<string, string> = {
  Aries: "Fire",
  Leo: "Fire",
  Sagittarius: "Fire",
  Taurus: "Earth",
  Virgo: "Earth",
  Capricorn: "Earth",
  Gemini: "Air",
  Libra: "Air",
  Aquarius: "Air",
  Cancer: "Water",
  Scorpio: "Water",
  Pisces: "Water"
};

const MODALITY_BY_SIGN: Record<string, string> = {
  Aries: "Cardinal",
  Cancer: "Cardinal",
  Libra: "Cardinal",
  Capricorn: "Cardinal",
  Taurus: "Fixed",
  Leo: "Fixed",
  Scorpio: "Fixed",
  Aquarius: "Fixed",
  Gemini: "Mutable",
  Virgo: "Mutable",
  Sagittarius: "Mutable",
  Pisces: "Mutable"
};

const PLANET_THEMES: Record<string, string> = {
  Sun: "Core vitality and direction.",
  Moon: "Emotional rhythm and inner needs.",
  Mercury: "Mind, voice, and meaning-making.",
  Venus: "Attraction, pleasure, and values.",
  Mars: "Drive, will, and assertion.",
  Jupiter: "Expansion, faith, and growth.",
  Saturn: "Discipline, boundaries, and mastery.",
  Uranus: "Liberation, change, and awakening.",
  Neptune: "Dreams, intuition, and vision.",
  Pluto: "Transformation, power, and depth.",
  Asc: "First impression and approach to life.",
  MC: "Public path and ambition."
};

const ELEMENT_TONES: Record<string, string> = {
  Fire: "Acts fast and follows desire.",
  Earth: "Builds slowly and stabilizes.",
  Air: "Connects through thought and conversation.",
  Water: "Feels deeply and moves intuitively."
};

const MODALITY_TONES: Record<string, string> = {
  Cardinal: "Initiates and starts the cycle.",
  Fixed: "Stays with what matters and protects momentum.",
  Mutable: "Adapts and reshapes with the moment."
};

const HOUSE_THEMES: Record<number, string> = {
  1: "identity, approach, and first impressions",
  2: "resources, values, and stability",
  3: "communication, learning, and close networks",
  4: "home, roots, and inner foundations",
  5: "creativity, romance, and joy",
  6: "craft, health, and daily rituals",
  7: "partnership, agreements, and mirrors",
  8: "intimacy, transformation, and shared power",
  9: "belief, travel, and higher learning",
  10: "vocation, reputation, and visibility",
  11: "community, allies, and future vision",
  12: "retreat, subconscious, and endings"
};

const ASPECT_LABELS: Record<string, string> = {
  conjunction: "Conjunction",
  opposition: "Opposition",
  trine: "Trine",
  square: "Square",
  sextile: "Sextile"
};

const ASPECT_MEANING: Record<string, string> = {
  conjunction: "Two planets speak as one.",
  opposition: "Tension asks for integration.",
  trine: "Energy flows easily and wants direction.",
  square: "Friction creates growth pressure.",
  sextile: "Opportunity responds to action."
};

const normalizeDegree = (deg: number): number => {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
};

const degreeToSign = (deg: number): string => {
  const signs = [
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
  ];
  return signs[Math.floor(normalizeDegree(deg) / 30) % 12] ?? "Aries";
};

const degreeToSignDegree = (deg: number): number => normalizeDegree(deg) % 30;

const formatPlacement = (point: any): string => {
  const parts = [`${point.sign} ${point.signDegree.toFixed(1)} deg`];
  if (point.house) parts.push(`House ${point.house}`);
  if (point.retrograde) parts.push("Retrograde");
  return parts.join(" · ");
};

const dominantLabels = (order: string[], counts: Record<string, number>): string[] => {
  const max = Math.max(...order.map((label) => counts[label] ?? 0));
  if (!Number.isFinite(max) || max <= 0) return [];
  return order.filter((label) => (counts[label] ?? 0) === max);
};

const countBy = (points: any[], lookup: Record<string, string>): Record<string, number> => {
  return points.reduce((acc, point) => {
    const label = lookup[point.sign];
    if (!label) return acc;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

export default function ChartPage() {
  const [chart, setChart] = useState<any | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setChart(loadChart());
    setSignedIn(Boolean(loadAuthSession()?.token));
  }, []);

  if (!chart) {
    return (
      <PageShell>
        <Section>
          <Heading>Chart Not Found</Heading>
          <Text muted>Return to intake to generate a chart.</Text>
          <Link href="/intake" className="astro-button astro-button-primary astro-button-block">
            Go to Intake
          </Link>
        </Section>
      </PageShell>
    );
  }

  const findPoint = (key: string) => chart.points.find((point: any) => point.key === key);
  const planetPlacements = PLANET_ORDER.map((key) => findPoint(key)).filter(Boolean);
  const sun = findPoint("Sun");
  const moon = findPoint("Moon");
  const rising = findPoint("Asc");
  const midheaven = findPoint("MC");
  const angles = [
    { label: "Sun", point: sun },
    { label: "Moon", point: moon },
    { label: "Rising", point: rising },
    { label: "Midheaven", point: midheaven }
  ].filter((item) => item.point);

  const aspectHighlights = [...(chart.aspects ?? [])]
    .sort((a: any, b: any) => a.orb - b.orb)
    .slice(0, 8);

  const houseCusps = chart.houses?.cusps?.map((deg: number, index: number) => ({
    house: index + 1,
    sign: degreeToSign(deg),
    degree: degreeToSignDegree(deg)
  }));

  const elementOrder = ["Fire", "Earth", "Air", "Water"];
  const modalityOrder = ["Cardinal", "Fixed", "Mutable"];
  const elementCounts = countBy(planetPlacements, ELEMENT_BY_SIGN);
  const modalityCounts = countBy(planetPlacements, MODALITY_BY_SIGN);
  const dominantElements = dominantLabels(elementOrder, elementCounts);
  const dominantModalities = dominantLabels(modalityOrder, modalityCounts);
  const totalPlacements = Math.max(planetPlacements.length, 1);
  const leadElement = dominantElements[0];
  const leadModality = dominantModalities[0];

  const chartMeta = [
    chart.locationLabel,
    chart.meta?.timezone,
    chart.meta?.houseSystem ? `${chart.meta.houseSystem} houses` : null
  ]
    .filter(Boolean)
    .join(" · ");

  const tightestAspect = aspectHighlights[0]
    ? `${aspectHighlights[0].between[0]} ${ASPECT_LABELS[aspectHighlights[0].type] ?? aspectHighlights[0].type} ${aspectHighlights[0].between[1]}`
    : null;
  const chartSaved = Boolean(chart.chartProfileId);

  return (
    <PageShell>
      <Section title="Birth Chart">
        <Heading level={2}>Your wheel comes first.</Heading>
        <Text muted>{brandCopy.chart.intro}</Text>
        {chartMeta ? <Text muted>{chartMeta}</Text> : null}
        {chart.meta?.timeUnknown ? (
          <div className="astro-note-strip">
            <strong>Time unknown</strong>
            <Text muted>Houses and angles are hidden, but the planetary and aspect pattern is still clear.</Text>
          </div>
        ) : null}

        <div className="astro-wheel-layout">
          <div className="astro-wheel-panel">
            <ChartWheel chart={chart} size={520} />
          </div>
          <div className="astro-wheel-insight">
            <Card>
              <Heading level={3}>Read this first</Heading>
              <ul className="astro-list">
                <li>Start with Sun, Moon, and Rising.</li>
                <li>Check the tightest aspect for flow or friction.</li>
                <li>Use houses after the core pattern feels clear.</li>
              </ul>
            </Card>
            <Card>
              <Heading level={3}>Chart anchors</Heading>
              <div className="astro-stack-tight">
                {angles.map((item: any) => (
                  <Text key={item.label} muted>
                    {item.label} · {formatPlacement(item.point)}
                  </Text>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </Section>

      <Section title="Quick Focus">
        <div className="astro-note-strip">
          <strong>
            {chartSaved
              ? "This chart is connected to your grimoire."
              : signedIn
                ? "Save this chart so the report and weekly notes have a home."
                : "Create an account to keep this chart and turn it into a living journal."}
          </strong>
          <Text muted>
            {chartSaved
              ? "Open your account to find the saved chart, the first report, and every weekly follow-up."
              : "The easiest path is: draw the chart, register or sign in, then save it once so every new reading can attach to the same story."}
          </Text>
          <Link
            href="/account"
            className={`astro-button ${chartSaved ? "astro-button-ghost" : "astro-button-primary"} astro-button-block`}
          >
            {chartSaved ? "Open Account" : signedIn ? "Save In Account" : "Create Account"}
          </Link>
        </div>

        <div className="astro-compact-grid">
          {sun ? (
            <Card>
              <Heading level={3}>Sun</Heading>
              <Text muted>{formatPlacement(sun)}</Text>
              <Text muted>{PLANET_THEMES.Sun}</Text>
            </Card>
          ) : null}
          {moon ? (
            <Card>
              <Heading level={3}>Moon</Heading>
              <Text muted>{formatPlacement(moon)}</Text>
              <Text muted>{PLANET_THEMES.Moon}</Text>
            </Card>
          ) : null}
          <Card>
            <Heading level={3}>{rising ? "Rising" : "Birth time"}</Heading>
            <Text muted>
              {rising ? formatPlacement(rising) : "Add an exact birth time to reveal the Rising sign and house structure."}
            </Text>
            <Text muted>{rising ? PLANET_THEMES.Asc : "Without time, the reading stays focused on signs and aspects."}</Text>
          </Card>
          <Card>
            <Heading level={3}>Tightest thread</Heading>
            <Text muted>{tightestAspect ? `${tightestAspect} · orb ${aspectHighlights[0].orb.toFixed(1)} deg` : "No major aspect highlights yet."}</Text>
            <Text muted>{tightestAspect ? ASPECT_MEANING[aspectHighlights[0].type] ?? "A meaningful energetic link." : "The chart still holds meaning even when one aspect is not dominant."}</Text>
          </Card>
          <Card>
            <Heading level={3}>Element balance</Heading>
            <Text muted>
              {dominantElements.length ? `Dominant: ${dominantElements.join(", ")}.` : "No element stands above the rest."}
            </Text>
            <Text muted>
              {leadElement ? ELEMENT_TONES[leadElement] ?? "" : "Your chart is spread across multiple styles of expression."}
            </Text>
          </Card>
          <Card>
            <Heading level={3}>Modality balance</Heading>
            <Text muted>
              {dominantModalities.length ? `Dominant: ${dominantModalities.join(", ")}.` : "No single modality dominates."}
            </Text>
            <Text muted>
              {leadModality ? MODALITY_TONES[leadModality] ?? "" : "You move through change with a mixed rhythm."}
            </Text>
          </Card>
        </div>

        <details className="astro-details">
          <summary>Planetary placements</summary>
          <div className="astro-details-body">
            <div className="astro-grid">
              {planetPlacements.map((point: any) => {
                const element = ELEMENT_BY_SIGN[point.sign] ?? "Aether";
                const modality = MODALITY_BY_SIGN[point.sign] ?? "Mutable";
                return (
                  <Card key={point.key}>
                    <Heading level={3}>{point.key}</Heading>
                    <Text muted>{formatPlacement(point)}</Text>
                    <Text muted>{PLANET_THEMES[point.key] ?? "A core planetary signature."}</Text>
                    <Text muted>{`Element ${element} · Modality ${modality}.`}</Text>
                  </Card>
                );
              })}
            </div>
          </div>
        </details>

        <details className="astro-details">
          <summary>Aspect highlights</summary>
          <div className="astro-details-body">
            {aspectHighlights.length > 0 ? (
              <div className="astro-grid">
                {aspectHighlights.map((aspect: any, index: number) => (
                  <Card key={`${aspect.between.join("-")}-${index}`}>
                    <Heading level={3}>
                      {aspect.between[0]} {ASPECT_LABELS[aspect.type] ?? aspect.type} {aspect.between[1]}
                    </Heading>
                    <Text muted>Orb {aspect.orb.toFixed(1)} deg</Text>
                    <Text muted>{ASPECT_MEANING[aspect.type] ?? "A meaningful energetic link."}</Text>
                  </Card>
                ))}
              </div>
            ) : (
              <Text muted>No major aspects found yet.</Text>
            )}
          </div>
        </details>

        <details className="astro-details">
          <summary>Element and modality balance</summary>
          <div className="astro-details-body">
            <div className="astro-grid-tight">
              {elementOrder.map((label) => {
                const count = elementCounts[label] ?? 0;
                const widthPct = (count / totalPlacements) * 100;
                return (
                  <Card key={label}>
                    <Heading level={3}>{label}</Heading>
                    <Text muted>{count} placements</Text>
                    <div className="astro-meter" aria-hidden="true">
                      <span style={{ width: `${widthPct}%` }} />
                    </div>
                    <Text muted>{ELEMENT_TONES[label]}</Text>
                  </Card>
                );
              })}
              {modalityOrder.map((label) => {
                const count = modalityCounts[label] ?? 0;
                const widthPct = (count / totalPlacements) * 100;
                return (
                  <Card key={label}>
                    <Heading level={3}>{label}</Heading>
                    <Text muted>{count} placements</Text>
                    <div className="astro-meter" aria-hidden="true">
                      <span style={{ width: `${widthPct}%` }} />
                    </div>
                    <Text muted>{MODALITY_TONES[label]}</Text>
                  </Card>
                );
              })}
            </div>
          </div>
        </details>

        <details className="astro-details">
          <summary>House cusps</summary>
          <div className="astro-details-body">
            {houseCusps ? (
              <div className="astro-grid-tight">
                {houseCusps.map((house: any) => (
                  <Card key={house.house}>
                    <Heading level={3}>House {house.house}</Heading>
                    <Text muted>
                      {house.sign} {house.degree.toFixed(1)} deg
                    </Text>
                    <Text muted>{HOUSE_THEMES[house.house] ?? ""}</Text>
                  </Card>
                ))}
              </div>
            ) : (
              <Text muted>Add a birth time to reveal house cusps.</Text>
            )}
          </div>
        </details>
      </Section>

      <Section>
        <div className="astro-hero-actions">
          <Link href="/reading" className="astro-button astro-button-primary astro-button-block">
            View Full Reading
          </Link>
          <Link href="/compatibility" className="astro-button astro-button-ghost astro-button-block">
            Relationship Map
          </Link>
        </div>
      </Section>
    </PageShell>
  );
}
