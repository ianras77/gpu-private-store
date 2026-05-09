import Link from "next/link";

import { PublicHeader } from "@/components/PublicHeader";
import { getPublicSiteData, themeName, themeNarrative } from "@/lib/public-site";

const tastePrinciples = [
  {
    label: "Warm",
    copy: "The site should feel like paper, lacquer, lipstick, and a desk lamp, not a fluorescent panic room.",
  },
  {
    label: "Sharp",
    copy: "Every pretty surface needs a reason. The design should make the argument easier to hold, not gentler.",
  },
  {
    label: "Travelable",
    copy: "If the site is going to make good lines, the whole brand has to survive a screenshot, a tote, a sticker, and a second look.",
  },
];

export default async function CatPage() {
  const { activeThemes, liveSocialLines } = await getPublicSiteData();

  const featuredThemes = activeThemes.slice(0, 4);
  const lineShelf = liveSocialLines.slice(0, 4);

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="page-hero">
          <p className="hero-kicker">Taste</p>
          <h1>The visual and emotional brief behind BAT</h1>
          <p className="hero-note">
            This page exists because I do not think aesthetics are separate from editorial intent. BAT is supposed to feel warm, witty,
            and unmistakably feminine while still being perfectly clear about the stakes. The design is part of how the site keeps its nerve.
          </p>
        </section>

        <section className="process-strip">
          {tastePrinciples.map((principle) => (
            <article key={principle.label} className="process-card">
              <span>{principle.label}</span>
              <p>{principle.copy}</p>
            </article>
          ))}
        </section>

        <div className="manifesto-grid">
          <article className="editorial-copy">
            <h2>Why it is warm</h2>
            <p>
              I do not want BAT to feel like institutional beige or default dark-mode dread. The warm paper palette says this is a place
              where a person arranged the table before asking you to sit down and pay attention.
            </p>
            <p>
              That softness matters because the subject matter is abrasive. The site should welcome you in without lying about where you
              are.
            </p>
          </article>

          <article className="editorial-copy">
            <h2>Why it still cuts</h2>
            <p>
              The softness is not there to blur the argument. It is there so the sharp lines land harder. The page can look lacquered and
              still carry a sentence that leaves a mark.
            </p>
            <p>
              That balance is the whole BAT proposition: glamour without mush, polish without cowardice, political writing without the dead
              mall energy.
            </p>
          </article>

          <article className="editorial-copy">
            <h2>Why the brand has to travel</h2>
            <p>
              I think in objects as much as interfaces. A good BAT line should work on the homepage, yes, but it should also make sense on
              a hat, a tote, a sticker, or the side of a screenshot in somebody&apos;s group chat.
            </p>
            <p>
              That is not vanity. It is distribution with standards.
            </p>
          </article>
        </div>

        <section className="column-band">
          <article className="story-panel">
            <p className="section-kicker">Current motifs</p>
            <h3>The live themes staining the visual mood</h3>
            <div className="stack-list compact">
              {featuredThemes.map((theme) => (
                <Link key={theme.slug} href={`/themes/${theme.slug}`} className="stack-item">
                  <strong>{themeName(theme)}</strong>
                  <span>{themeNarrative(theme)}</span>
                </Link>
              ))}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Lines that travel</p>
            <h3>The sort of language the brand needs to hold</h3>
            <div className="social-cards">
              {lineShelf.length ? (
                lineShelf.map((line, index) => (
                  <article key={`${index}-${line}`} className="social-card">
                    <span>keep this</span>
                    <p>{line}</p>
                  </article>
                ))
              ) : (
                <p className="stack-empty">The line shelf will fill in as soon as the latest cycle produces something worth stealing.</p>
              )}
            </div>
          </article>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">Reader fantasy</p>
            <h3>Feel informed without dressing like doom.</h3>
            <p>
              BAT is for the reader who wants the reporting, the angle, and the line to send her friends before brunch without feeling like
              she just wandered through a fluorescent government hallway.
            </p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Where the taste goes next</p>
            <h3>The homepage, the archive, and the merch test all answer to the same brief.</h3>
            <p>
              The public site should feel cohesive: the home page invites you in, the archive keeps the memory, the notebook shows the
              process, and the visual language makes the whole thing feel collectible instead of disposable.
            </p>
            <div className="hero-actions">
              <Link href="/about" className="button-link muted small">
                Read the about page
              </Link>
              <Link href="/archive" className="button-link muted small">
                Open the archive
              </Link>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
