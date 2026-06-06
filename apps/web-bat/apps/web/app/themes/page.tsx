import Link from "next/link";

import { safeDate } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import { getPublicSiteData, themeName, themeNarrative } from "@/lib/public-site";

function heatWidth(score?: number): string {
  const scaled = Math.max(16, Math.min(100, Math.round((score ?? 0) * 0.4)));
  return `${scaled}%`;
}

export default async function ThemesIndexPage() {
  const { themes, latestCycle, opportunityBoard } = await getPublicSiteData();

  const visibleThemes = themes.slice(0, 10);
  const hottestTheme = visibleThemes[0];
  const topOpportunities = opportunityBoard.slice(0, 3);

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="page-hero">
          <p className="hero-kicker">Lanes</p>
          <h1>The recurring patterns I keep circling</h1>
          <p className="hero-note">
            The lanes are where I stop pretending each headline is a brand-new animal. They are the names I give the habits, performances,
            and power moves that keep reappearing beneath the daily noise.
          </p>
        </section>

        <section className="process-strip">
          <article className="process-card">
            <span>Name it</span>
            <p>A lane starts when the same Trump-world logic keeps showing up in different outfits.</p>
          </article>
          <article className="process-card">
            <span>Track it</span>
            <p>
              {hottestTheme
                ? `${themeName(hottestTheme)} is hottest right now, which is my way of saying the pattern has not finished embarrassing itself.`
                : "The hottest lane is simply the pattern I cannot stop seeing in the latest pass."}
            </p>
          </article>
          <article className="process-card">
            <span>File it</span>
            <p>The archive and front page get sharper when the pattern has a proper drawer to live in.</p>
          </article>
        </section>

        <section className="frontline-grid archive-stats">
          <article className="story-panel">
            <p className="section-kicker">Active lanes</p>
            <h3>{themes.length}</h3>
            <p>Patterns warm enough to keep influencing what I read, file, and argue next.</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Hottest lane</p>
            <h3>{hottestTheme ? themeName(hottestTheme) : "Still loading"}</h3>
            <p>{hottestTheme ? themeNarrative(hottestTheme) : "The next completed cycle will decide which lane tops the board."}</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Latest edition</p>
            <h3>{latestCycle?.completed_at ? safeDate(latestCycle.completed_at) : "Live now"}</h3>
            <p>The latest sweep keeps the lanes close to the actual news instead of yesterday's mood.</p>
          </article>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">How to use the lanes</p>
            <h3>Read them the way I do when the headlines start getting slippery.</h3>
            <p>
              If the front page tells you what is hottest, the lanes tell you why it belongs there. They are the recurring logics, moods, and
              power patterns I keep finding underneath the daily spectacle.
            </p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">What rose in the latest pass</p>
            <div className="stack-list compact">
              {topOpportunities.length ? (
                topOpportunities.map((item) => (
                  <div key={`${item.slug}-${item.query_hint}`} className="stack-item static">
                    <strong>{item.theme || "Opportunity board"}</strong>
                    <span>{item.angle || item.query_hint || "Still hot enough to deserve another look."}</span>
                  </div>
                ))
              ) : (
                <p className="stack-empty">Fresh opportunity notes will land here after the next sweep finds something worth keeping.</p>
              )}
            </div>
          </article>
        </section>

        <section className="column-band">
          {visibleThemes.length ? (
            visibleThemes.map((theme) => (
              <article key={theme.slug} className="story-panel">
                <p className="section-kicker">Live lane</p>
                <h3>
                  <Link href={`/themes/${theme.slug}`}>{themeName(theme)}</Link>
                </h3>
                <p>{themeNarrative(theme)}</p>
                <div className="heat-list">
                  <div className="heat-row static">
                    <div className="heat-copy">
                      <strong>Heat {(theme.active_score ?? 0).toFixed(2)}</strong>
                      <span>{theme.metadata?.membership_count ?? 0} related source memberships in the current board.</span>
                    </div>
                    <div className="heat-meter" aria-hidden="true">
                      <div className="heat-bar" style={{ width: heatWidth(theme.active_score) }} />
                    </div>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <article className="story-panel panel-span-2">
              <p className="section-kicker">Board warming up</p>
              <h3>The next completed cycle will repopulate the public lane board.</h3>
              <p>Once the themes are available again, the patterns will have names worth using.</p>
            </article>
          )}
        </section>
      </main>
    </>
  );
}
