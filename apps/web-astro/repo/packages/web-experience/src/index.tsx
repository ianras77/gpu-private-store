"use client";

import Link from "next/link";
import type { BrandConfig } from "@astro/brands";
import { ChartCompanion, ChartWheel, Heading, Text } from "@astro/ui";
import { useEffect, useState } from "react";

type ChartLoader = () => any | null;
type SessionLoader = () => { token?: string } | null;

async function fetchPrimaryChart(token: string, brandId: string): Promise<any | null> {
  try {
    const response = await fetch("/api/v1/charts", { headers: { authorization: `Bearer ${token}`, "X-Brand-Id": brandId } });
    if (!response.ok) return null;
    const data = await response.json();
    const profile = (data.charts ?? []).find((item: any) => item.isPrimary) ?? data.charts?.[0];
    return profile?.chartJson ? { ...profile.chartJson, chartProfileId: profile.id, chartProfileLabel: profile.label, locationLabel: profile.locationLabel, birthDate: profile.birthDate, timeUnknown: profile.timeUnknown } : null;
  } catch {
    return null;
  }
}

export function BrandMark({ brand }: { brand: BrandConfig }) {
  return <span className={`brand-mark brand-mark-${brand.id}`} aria-hidden="true"><span /></span>;
}

export function BrandHeader({ brand }: { brand: BrandConfig }) {
  return <header className={`experience-header nav-${brand.experience.navigation}`}>
    <Link href="/" className="experience-brand"><BrandMark brand={brand} /><span>{brand.name}</span></Link>
    <nav aria-label="Primary navigation"><Link href="/chart">Your chart</Link><Link href="/reading">Reading</Link><Link href="/compatibility">Compatibility</Link><Link href="/account" className="experience-nav-cta">Private atlas</Link></nav>
  </header>;
}

const heroCopy: Record<string, { eyebrow: string; body: string; action: string }> = {
  atlas: { eyebrow: "An old language, a living life", body: "A clear, personal map of the sky at your beginning — made for the choices, patterns, and openings already moving through your life.", action: "Make my sky map" },
  observatory: { eyebrow: "A record of what endures", body: "Read the structure beneath the noise. Find the patterns that ask for patience, boundaries, and a strength you can actually keep.", action: "Draw my chart" },
  stage: { eyebrow: "Your life, under a better light", body: "A chart reading for creative authority, visible work, and the courage to make something that carries your name.", action: "Bring me into focus" },
  fracture: { eyebrow: "The useful truth has an edge", body: "See the pressure points without shame or spectacle. Turn friction into information, then decide what to do with it.", action: "Show me the pattern" },
  veil: { eyebrow: "A signal beneath the surface", body: "Notice the patterns that keep returning, the thresholds you are crossing, and the quiet knowledge you already carry.", action: "Open my chart" }
};

function SkyInstrument({ brand, chart }: { brand: BrandConfig; chart: any | null }) {
  if (chart?.points?.length) return <div className="home-chart-wheel"><ChartWheel chart={chart} size={520} focusStep="synthesis" /></div>;
  return <div className="home-instrument" aria-label="Celestial instrument illustration" role="img">
    <span className="instrument-ring ring-one" /><span className="instrument-ring ring-two" /><span className="instrument-ring ring-three" />
    <span className="instrument-cross instrument-cross-x" /><span className="instrument-cross instrument-cross-y" />
    <span className="instrument-star star-a">✳</span><span className="instrument-star star-b">✦</span><span className="instrument-star star-c">✧</span>
    <div className="instrument-core"><BrandMark brand={brand} /><span>SKY / SELF</span><small>A human life under an old sky</small></div>
    <span className="instrument-coordinate coordinate-a">✷ &nbsp; 00° 00′</span><span className="instrument-coordinate coordinate-b">✦ &nbsp; YOUR BEGINNING</span>
  </div>;
}

export function BrandHome({ brand, loadChart, loadSession }: { brand: BrandConfig; loadChart: ChartLoader; loadSession: SessionLoader }) {
  const [chart, setChart] = useState<any | null>(null);
  useEffect(() => {
    let active = true;
    const localChart = loadChart();
    setChart(localChart);
    const token = loadSession()?.token;
    if (!localChart && token) void fetchPrimaryChart(token, brand.id).then((savedChart) => { if (active && savedChart) setChart(savedChart); });
    return () => { active = false; };
  }, [loadChart, loadSession, brand.id]);
  const copy = heroCopy[brand.experience.heroVariant] ?? heroCopy.atlas!;
  const points = chart?.points ?? [];
  const signature = ["Sun", "Moon", "Asc"].map((key) => points.find((point: any) => point.key === key));
  const hasChart = Boolean(chart?.points?.length);

  return <div className={`experience-home home-${brand.experience.heroVariant}`}>
    <section className="experience-hero">
      <div className="experience-hero-copy">
        <p className="experience-eyebrow"><span className="eyebrow-spark">✳</span>{copy.eyebrow}</p>
        <Heading>{brand.experience.tagline}</Heading>
        <Text>{copy.body}</Text>
        <div className="experience-actions"><Link className="experience-button experience-button-primary" href={hasChart ? "/chart" : "/intake"}>{hasChart ? "Return to my chart" : copy.action}<span aria-hidden="true">↗</span></Link><Link className="experience-button experience-button-secondary" href="/reading">Explore a reading</Link></div>
        <div className="experience-trust"><span>01 · precise sky</span><span>02 · human meaning</span><span>03 · your own choice</span></div>
      </div>
      <div className="experience-hero-object"><SkyInstrument brand={brand} chart={chart} /></div>
    </section>

    {hasChart ? <section className="home-personal-orbit">
      <div><p className="experience-eyebrow">Your chart is here</p><Heading level={2}>A little more personal, already.</Heading><Text muted>{chart.locationLabel ? `Drawn for ${chart.locationLabel}.` : "Your chart is ready to explore."} The details stay yours; the interpretation stays open.</Text><Link href="/chart" className="text-link">Open the whole map <span aria-hidden="true">↗</span></Link></div>
      <div className="home-signature">{signature.map((point: any, index) => <div className="home-signature-item" key={index}><span>{["SUN", "MOON", "RISING"][index]}</span><strong>{point ? point.sign : "—"}</strong><small>{point ? `${Number(point.signDegree).toFixed(1)}°` : "Birth time unknown"}</small></div>)}</div>
    </section> : <section className="experience-proof">
      <div><p className="experience-eyebrow">Start with what is known</p><Heading level={2}>The sky is precise. Your life stays yours.</Heading></div>
      <div className="experience-proof-grid"><article><strong>01 / THE SKY</strong><h3>First, the real geometry.</h3><p>Planet positions, houses, aspects, and timing are calculated before any interpretation begins.</p></article><article><strong>02 / THE STORY</strong><h3>Then, a thoughtful reading.</h3><p>Mastra brings the chart facts together, follows your questions, and leaves uncertainty visible.</p></article><article><strong>03 / THE HUMAN</strong><h3>Meaning without a verdict.</h3><p>Keep what feels useful. The chart can open a question; only you can decide the answer.</p></article></div>
    </section>}

    <section className="experience-capabilities">
      <div className="capabilities-heading"><p className="experience-eyebrow">Your personal observatory</p><Heading level={2}>Made for the parts that matter.</Heading><Text muted>A beautiful map is a beginning. Here are a few ways to live with it.</Text></div>
      <div className="capability-grid">
        <Link href={hasChart ? "/chart" : "/intake"} className="capability-card capability-card-featured"><span className="capability-number">I</span><span className="capability-symbol">◉</span><h3>Read the map</h3><p>Explore the wheel, placements, elements, and the patterns that hold them together.</p><b>OPEN CHART ↗</b></Link>
        <Link href="/reading" className="capability-card"><span className="capability-number">II</span><span className="capability-symbol">✳</span><h3>Ask a better question</h3><p>Build a reading from the facts, then keep exploring with your chart companion.</p><b>EXPLORE READING ↗</b></Link>
        <Link href="/compatibility" className="capability-card"><span className="capability-number">III</span><span className="capability-symbol">◌</span><h3>Meet in the middle</h3><p>Place two skies in conversation and see where connection comes easily or asks for care.</p><b>COMPARE TWO CHARTS ↗</b></Link>
      </div>
    </section>

    <section className="experience-final"><p className="experience-eyebrow">{brand.name} · {brand.experience.archetype}</p><Heading level={2}>{brand.experience.mood} — with room to be human.</Heading><Link className="experience-button experience-button-primary" href={hasChart ? "/chart" : "/intake"}>{hasChart ? "Return to your sky" : "Begin with the birth chart"}<span aria-hidden="true">↗</span></Link></section>
  </div>;
}

const elements: Record<string, string> = { Aries: "Fire", Leo: "Fire", Sagittarius: "Fire", Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth", Gemini: "Air", Libra: "Air", Aquarius: "Air", Cancer: "Water", Scorpio: "Water", Pisces: "Water" };
const modalities: Record<string, string> = { Aries: "Cardinal", Cancer: "Cardinal", Libra: "Cardinal", Capricorn: "Cardinal", Taurus: "Fixed", Leo: "Fixed", Scorpio: "Fixed", Aquarius: "Fixed", Gemini: "Mutable", Virgo: "Mutable", Sagittarius: "Mutable", Pisces: "Mutable" };
const planets = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

function BalanceBars({ title, values, colors }: { title: string; values: Record<string, number>; colors: Record<string, string> }) {
  const max = Math.max(1, ...Object.values(values));
  return <div className="chart-balance"><h3>{title}</h3>{Object.entries(values).map(([key, value]) => <div className="chart-balance-row" key={key}><span>{key}</span><div><i style={{ width: `${(value / max) * 100}%`, background: colors[key] }} /></div><b>{value}</b></div>)}</div>;
}

export function ChartExperience({ brand, loadChart, loadSession }: { brand: BrandConfig; loadChart: ChartLoader; loadSession: SessionLoader }) {
  const [chart, setChart] = useState<any>(null);
  const [session, setSession] = useState<{ token?: string } | null>(null);
  const [focus, setFocus] = useState<"synthesis" | "ring" | "houses" | "planets" | "aspects">("synthesis");
  const [selectedPlanet, setSelectedPlanet] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    const localChart = loadChart();
    const nextSession = loadSession();
    setChart(localChart);
    setSession(nextSession);
    if (!localChart && nextSession?.token) void fetchPrimaryChart(nextSession.token, brand.id).then((savedChart) => { if (active && savedChart) setChart(savedChart); });
    return () => { active = false; };
  }, [loadChart, loadSession, brand.id]);
  if (!chart) return <div className="experience-empty"><p className="experience-eyebrow">{brand.name}</p><Heading>Start with the moment you arrived.</Heading><Text>Your calculated chart becomes the visual map for everything that follows.</Text><Link className="experience-button experience-button-primary" href="/intake">Begin with birth data ↗</Link></div>;
  const points = chart.points ?? [];
  const point = (key: string) => points.find((item: any) => item.key === key);
  const sun = point("Sun"), moon = point("Moon"), rising = point("Asc");
  const elementCounts: Record<string, number> = {}, modalityCounts: Record<string, number> = {};
  points.filter((item: any) => planets.includes(item.key)).forEach((item: any) => { const element = elements[item.sign]; const mode = modalities[item.sign]; if (element) elementCounts[element] = (elementCounts[element] ?? 0) + 1; if (mode) modalityCounts[mode] = (modalityCounts[mode] ?? 0) + 1; });
  const hasHouses = Boolean(chart.houses?.cusps?.length === 12);
  const focusItems = (["synthesis", "ring", "houses", "planets", "aspects"] as const).filter((item) => item !== "houses" || hasHouses);
  const timeUnknown = Boolean(chart.timeUnknown || chart.meta?.timeUnknown);
  const savedChartId = chart.chartProfileId as string | undefined;
  const access = session?.token && savedChartId ? { token: session.token, chartProfileId: savedChartId, brandId: brand.id } : undefined;
  return <div className="chart-experience">
    <section className="chart-intro"><div><p className="experience-eyebrow">{brand.name} · NATAL MAP</p><Heading>Your sky, made legible.</Heading><Text>{chart.locationLabel ? `Calculated for ${chart.locationLabel}.` : "A deterministic map of the sky at your birth."} Start with the wheel, then follow the patterns it makes visible.</Text></div><div className="chart-meta-strip"><span>{points.filter((item: any) => planets.includes(item.key)).length} planets</span><span>{(chart.aspects ?? []).length} aspects</span><span>{hasHouses ? "Houses calculated" : timeUnknown ? "Birth time unknown" : "Houses unavailable"}</span></div></section>
    <section className="chart-stage"><div className="chart-stage-wheel"><ChartWheel chart={chart} size={600} focusStep={focus} highlightPlanetKey={selectedPlanet} /></div><div className="chart-stage-side"><p className="experience-eyebrow">FOCUS THE MAP</p><div className="chart-focus-tabs" role="tablist" aria-label="Chart layers">{focusItems.map((item) => <button key={item} className={focus === item ? "active" : ""} onClick={() => setFocus(item)} role="tab" aria-selected={focus === item}>{item}</button>)}</div><div className="chart-big-three"><h2>Your starting points</h2>{[["Sun", sun], ["Moon", moon], ["Rising", rising]].map(([label, item]: any) => item ? <button type="button" key={label} className={`chart-signature ${selectedPlanet === (label === "Rising" ? "Asc" : label) ? "selected" : ""}`} onClick={() => { setSelectedPlanet(label === "Rising" ? "Asc" : label); setFocus("planets"); }}><strong>{label}</strong><span>{item.sign} {Number(item.signDegree).toFixed(1)}°</span><small>{label === "Sun" ? "direction and vitality" : label === "Moon" ? "emotional rhythm" : "how life meets you"}</small></button> : <div key={label} className="chart-signature chart-muted"><strong>{label}</strong><span>Unavailable</span><small>Birth time required</small></div>)}</div><p className="chart-reading-note">{!hasHouses && timeUnknown ? "Birth time unknown: house divisions and Rising are intentionally omitted." : "A symbol can describe a pattern. It cannot tell you who to be."}</p></div></section>
    <section className="chart-analysis"><div className="chart-analysis-heading"><p className="experience-eyebrow">PATTERN LANGUAGE</p><Heading level={2}>The architecture underneath.</Heading><Text>These are visual ways to notice where your chart concentrates energy — not scores or diagnoses.</Text></div><BalanceBars title="Elements" values={elementCounts} colors={{ Fire: "#d8794d", Earth: "#718f68", Air: "#698eb1", Water: "#6b7fb2" }} /><BalanceBars title="Modes" values={modalityCounts} colors={{ Cardinal: "#b46a4c", Fixed: "#647f75", Mutable: "#8773a8" }} /></section>
    <section className="chart-placement-section"><div><p className="experience-eyebrow">PLANETARY INDEX</p><Heading level={2}>Where the story lives.</Heading><Text muted>Select any placement to find it in the wheel.</Text></div><div className="chart-placement-grid">{points.filter((item: any) => planets.includes(item.key)).map((item: any) => <button type="button" key={item.key} className={`chart-placement ${selectedPlanet === item.key ? "selected" : ""}`} onClick={() => { setSelectedPlanet(item.key); setFocus("planets"); }}><strong>{item.key}</strong><span>{item.sign} {Number(item.signDegree).toFixed(1)}°</span><small>{item.house ? `House ${item.house}` : item.retrograde ? "Retrograde" : "Planetary placement"}</small><b aria-hidden="true">↗</b></button>)}</div></section>
    {access ? <ChartCompanion {...access} /> : <section className="chart-companion-locked"><span className="capability-symbol">✳</span><p className="experience-eyebrow">THE CHART COMPANION</p><Heading level={2}>Take the conversation further.</Heading><Text muted>Save this chart to your private atlas to ask follow-up questions, keep your thread, and explore what matters to you.</Text><Link href="/account" className="experience-button experience-button-primary">{session?.token ? "Save this chart" : "Open your private atlas"} ↗</Link></section>}
  </div>;
}
