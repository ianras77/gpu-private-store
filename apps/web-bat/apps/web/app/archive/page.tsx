import Link from "next/link";

import { safeDate } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import { cleanCopy, getPublicSiteData, humanizeSlug, storySummary, themeName, themeNarrative } from "@/lib/public-site";

export default async function ArchivePage() {
  const { publishedStories, activeThemes, latestCycle } = await getPublicSiteData();

  const leadStories = publishedStories.filter((story) => story.object_type === "lead_story");
  const themeTakes = publishedStories.filter((story) => story.object_type === "theme_take");
  const highlights = publishedStories.slice(0, 4);
  const topThemes = activeThemes.slice(0, 4);
  const latestPublished = publishedStories[0];

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="page-hero">
          <p className="hero-kicker">Archive</p>
          <h1>The shelf where I keep the site's memory</h1>
          <p className="hero-note">
            This is not just a dump of posts. It is the shelf that keeps the homepage honest, with recurring lanes, sharper lead pieces,
            and enough continuity that the current mess can still be read in context instead of as a permanent surprise.
          </p>
        </section>

        <section className="process-strip">
          <article className="process-card">
            <span>Newest first</span>
            <p>
              {latestPublished
                ? `If you only have a minute, start with the newest file from ${safeDate(latestPublished.published_at || latestPublished.created_at)}.`
                : "If you only have a minute, start with the newest file once the next published run lands."}
            </p>
          </article>
          <article className="process-card">
            <span>Then sideways</span>
            <p>The theme takes are how I keep one headline from pretending it has no relatives.</p>
          </article>
          <article className="process-card">
            <span>Then backward</span>
            <p>The older shelf matters because I do not want tomorrow's post to erase yesterday's pattern.</p>
          </article>
        </section>

        <section className="frontline-grid archive-stats">
          <article className="story-panel">
            <p className="section-kicker">Live</p>
            <h3>{publishedStories.length}</h3>
            <p>Stories already filed, published, and ready to be carried back into the next cycle.</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Lead stories</p>
            <h3>{leadStories.length}</h3>
            <p>The bigger front-page pieces that set the temperature for the rest of the site.</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Theme takes</p>
            <h3>{themeTakes.length}</h3>
            <p>Posts attached to the recurring patterns I keep seeing under the headline churn.</p>
          </article>
        </section>

        <section className="column-band">
          <article className="story-panel">
            <p className="section-kicker">Start with these</p>
            <h3>The freshest reads on the shelf</h3>
            <div className="stack-list compact">
              {highlights.length ? (
                highlights.map((story) => (
                  <Link key={story.id} href={`/story/${story.slug}`} className="stack-item">
                    <strong>{cleanCopy(story.title)}</strong>
                    <span>{storySummary(story)}</span>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">Once the next published run lands, the strongest entries will surface here first.</p>
              )}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">The shelf underneath the shelf</p>
            <h3>Themes that keep pulling stories back together</h3>
            <div className="stack-list compact">
              {topThemes.length ? (
                topThemes.map((theme) => (
                  <Link key={theme.slug} href={`/themes/${theme.slug}`} className="stack-item">
                    <strong>{themeName(theme)}</strong>
                    <span>{themeNarrative(theme)}</span>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">The active theme map will fill in here once the next cycle updates the lane board.</p>
              )}
            </div>
          </article>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">How to use this archive</p>
            <h3>Read it like the part of the desk that remembers for me.</h3>
            <p>
              Start with the latest lead story if you want the clearest read on the moment. Then move sideways into the theme takes when
              you want to see what pattern I think the current outrage belongs to.
            </p>
            <p>
              The archive matters because I do not want the site to begin from zero every morning. The shelf is how BAT remembers itself.
            </p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Current rhythm</p>
            <h3>Fresh edition, active shelf, visible recency.</h3>
            <p>
              Latest archive update: {latestPublished ? safeDate(latestPublished.published_at || latestPublished.created_at) : "still warming up"}.
            </p>
            <p>
              Latest site edition: {latestCycle?.completed_at ? safeDate(latestCycle.completed_at) : "running live now"}. I want those two
              timestamps to stay close enough that the site never feels abandoned.
            </p>
          </article>
        </section>

        <section className="story-panel panel-span-2">
          <p className="section-kicker">Full shelf</p>
          {latestPublished ? <p className="column-note">Newest file on the shelf: {safeDate(latestPublished.published_at || latestPublished.created_at)}.</p> : null}
          <div className="table-shell">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {publishedStories.map((story) => (
                  <tr key={story.id}>
                    <td>
                      <Link href={`/story/${story.slug}`}>{cleanCopy(story.title)}</Link>
                    </td>
                    <td>{humanizeSlug(story.object_type)}</td>
                    <td>Live</td>
                    <td>{safeDate(story.published_at || story.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!publishedStories.length ? <p className="stack-empty">Nothing live yet, but the shelf is built and waiting.</p> : null}
        </section>
      </main>
    </>
  );
}
