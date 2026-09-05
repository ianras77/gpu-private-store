import Link from "next/link";
import type { BrandConfig } from "@astro/brands";
import { Heading, Text } from "@astro/ui";

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
