"use client";
import Link from "next/link";
import type { BrandConfig } from "@astro/brands";
import { Heading, Text, ChartWheel } from "@astro/ui";
import { useEffect, useState } from "react";

export function BrandMark({ brand }: { brand: BrandConfig }) {
  return <span className={`brand-mark brand-mark-${brand.id}`} aria-hidden="true"><span /></span>;
}

export function BrandHeader({ brand }: { brand: BrandConfig }) {
  return <header className={`experience-header nav-${brand.experience.navigation}`}>
    <Link href="/" className="experience-brand"><BrandMark brand={brand} /><span>{brand.name}</span></Link>
    <nav aria-label="Primary navigation">
      <Link href="/intake">Birth chart</Link><Link href="/reading">Reading</Link><Link href="/compatibility">Compatibility</Link><Link href="/account" className="experience-nav-cta">Account</Link>
    </nav>
  </header>;
}

const heroCopy: Record<string, { eyebrow: string; body: string; action: string }> = {
  atlas: { eyebrow: "A chart for the road ahead", body: "A precise birth chart, interpreted as an intelligent atlas for the choices, patterns, and openings already moving through your life.", action: "Map my chart" },
  observatory: { eyebrow: "A record of what endures", body: "Read the structure beneath the noise. Saturnseer turns your birth chart into a clear, patient study of limits, strengths, and earned direction.", action: "Draw my chart" },
  stage: { eyebrow: "Your life, under a better light", body: "A chart reading for creative authority, visible work, and the courage to make something that carries your name.", action: "Reveal my chart" },
  fracture: { eyebrow: "The useful truth is rarely smooth", body: "See the pressure points without shame or spectacle. Malefic Me reads friction as information and gives it somewhere constructive to go.", action: "Show me the pattern" },
  veil: { eyebrow: "A signal beneath the surface", body: "A contemporary astrology reading for the patterns that keep returning, the thresholds you are crossing, and the quiet knowledge you already carry.", action: "Open my chart" }
};

export function BrandHome({ brand }: { brand: BrandConfig }) {
  const copy = heroCopy[brand.experience.heroVariant] ?? { eyebrow: "A chart for the road ahead", body: "A precise birth chart interpreted as a map for the life already moving through you.", action: "Map my chart" };
  return <div className={`experience-home home-${brand.experience.heroVariant}`}>
    <section className="experience-hero">
      <div className="experience-hero-copy"><p className="experience-eyebrow">{copy.eyebrow}</p><Heading>{brand.experience.tagline}</Heading><Text>{copy.body}</Text><div className="experience-actions"><Link className="experience-button experience-button-primary" href="/intake">{copy.action}</Link><Link className="experience-button experience-button-secondary" href="/reading">Explore the report</Link></div><p className="experience-trust">Deterministic chart calculation · private by design · reflective, not fatalistic</p></div>
      <div className="experience-hero-object" role="img" aria-label={`${brand.name} chart identity`}><div className="experience-orbit orbit-a" /><div className="experience-orbit orbit-b" /><div className="experience-orbit orbit-c" /><BrandMark brand={brand} /></div>
    </section>
    <section className="experience-proof"><div><p className="experience-eyebrow">The first page</p><Heading level={2}>The chart comes first. The story follows.</Heading></div><div className="experience-proof-grid"><article><strong>01</strong><h3>Calculate precisely</h3><p>Planets, houses, aspects, and uncertainty are calculated before interpretation begins.</p></article><article><strong>02</strong><h3>Read the architecture</h3><p>See the Big Three, dominant patterns, and the relationships between the parts of your chart.</p></article><article><strong>03</strong><h3>Keep the atlas</h3><p>Save your chart and return to long-form reports, compatibility, and weekly perspective.</p></article></div></section>
    <section className="experience-final"><p className="experience-eyebrow">{brand.name}</p><Heading level={2}>{brand.experience.mood}</Heading><Link className="experience-button experience-button-primary" href="/intake">Begin with the birth chart</Link></section>
  </div>;
}

const elements: Record<string, string> = { Aries: "Fire", Leo: "Fire", Sagittarius: "Fire", Taurus: "Earth", Virgo: "Earth", Capricorn: "Earth", Gemini: "Air", Libra: "Air", Aquarius: "Air", Cancer: "Water", Scorpio: "Water", Pisces: "Water" };
const modalities: Record<string, string> = { Aries: "Cardinal", Cancer: "Cardinal", Libra: "Cardinal", Capricorn: "Cardinal", Taurus: "Fixed", Leo: "Fixed", Scorpio: "Fixed", Aquarius: "Fixed", Gemini: "Mutable", Virgo: "Mutable", Sagittarius: "Mutable", Pisces: "Mutable" };
const planets = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

function BalanceBars({ title, values, colors }: { title: string; values: Record<string, number>; colors: Record<string, string> }) {
  const max = Math.max(1, ...Object.values(values));
  return <div className="chart-balance"><h3>{title}</h3>{Object.entries(values).map(([key, value]) => <div className="chart-balance-row" key={key}><span>{key}</span><div><i style={{ width: `${(value / max) * 100}%`, background: colors[key] }} /></div><b>{value}</b></div>)}</div>;
}

export function ChartExperience({ brand, loadChart }: { brand: BrandConfig; loadChart: () => any }) {
  const [chart, setChart] = useState<any>(null);
  const [focus, setFocus] = useState<"synthesis" | "ring" | "houses" | "planets" | "aspects">("synthesis");
  useEffect(() => setChart(loadChart()), [loadChart]);
  if (!chart) return <div className="experience-empty"><p className="experience-eyebrow">{brand.name}</p><Heading>Draw the chart first.</Heading><Text>Your calculated chart will become the visual map for everything that follows.</Text><Link className="experience-button experience-button-primary" href="/intake">Begin with birth data</Link></div>;
  const points = chart.points ?? [];
  const point = (key: string) => points.find((item: any) => item.key === key);
  const sun = point("Sun"), moon = point("Moon"), rising = point("Asc");
  const elementCounts: Record<string, number> = {}, modalityCounts: Record<string, number> = {};
  points.filter((item: any) => planets.includes(item.key)).forEach((item: any) => { const e = elements[item.sign]; const m = modalities[item.sign]; if (e) elementCounts[e] = (elementCounts[e] ?? 0) + 1; if (m) modalityCounts[m] = (modalityCounts[m] ?? 0) + 1; });
  return <div className="chart-experience">
    <section className="chart-intro"><div><p className="experience-eyebrow">{brand.name} · natal map</p><Heading>Your sky, made legible.</Heading><Text>{chart.locationLabel ? `Calculated for ${chart.locationLabel}.` : "A deterministic map of the sky at your birth."} Start with the wheel, then follow the patterns it makes visible.</Text></div><div className="chart-meta-strip"><span>Planets {points.filter((p: any) => planets.includes(p.key)).length}</span><span>Aspects {(chart.aspects ?? []).length}</span><span>{chart.meta?.timeUnknown ? "Time unknown" : "Houses calculated"}</span></div></section>
    <section className="chart-stage"><div className="chart-stage-wheel"><ChartWheel chart={chart} size={560} focusStep={focus} /></div><div className="chart-stage-side"><p className="experience-eyebrow">Focus the map</p><div className="chart-focus-tabs" role="tablist">{(["synthesis", "ring", "houses", "planets", "aspects"] as const).map((item) => <button key={item} className={focus === item ? "active" : ""} onClick={() => setFocus(item)} role="tab" aria-selected={focus === item}>{item}</button>)}</div><div className="chart-big-three"><h2>Big Three</h2>{[["Sun", sun], ["Moon", moon], ["Rising", rising]].map(([label, item]: any) => item ? <div key={label} className="chart-signature"><strong>{label}</strong><span>{item.sign} {Number(item.signDegree).toFixed(1)}°</span><small>{label === "Sun" ? "direction and vitality" : label === "Moon" ? "emotional rhythm" : "how life meets you"}</small></div> : <div key={label} className="chart-signature chart-muted"><strong>{label}</strong><span>Unavailable</span><small>Birth time required</small></div>)}</div></div></section>
    <section className="chart-analysis"><div className="chart-analysis-heading"><p className="experience-eyebrow">Pattern language</p><Heading level={2}>The architecture underneath.</Heading><Text>These are not scores or diagnoses. They are visual ways to notice where your chart concentrates energy.</Text></div><BalanceBars title="Elements" values={elementCounts} colors={{ Fire: "#d8794d", Earth: "#718f68", Air: "#698eb1", Water: "#6b7fb2" }} /><BalanceBars title="Modes" values={modalityCounts} colors={{ Cardinal: "#b46a4c", Fixed: "#647f75", Mutable: "#8773a8" }} /></section>
    <section className="chart-placement-section"><div><p className="experience-eyebrow">Planetary index</p><Heading level={2}>Where the story lives.</Heading></div><div className="chart-placement-grid">{points.filter((p: any) => planets.includes(p.key)).map((item: any) => <article key={item.key}><strong>{item.key}</strong><span>{item.sign} {Number(item.signDegree).toFixed(1)}°</span>{item.house ? <small>House {item.house}</small> : <small>{item.retrograde ? "Retrograde" : "Planetary placement"}</small>}</article>)}</div></section>
  </div>;
}
