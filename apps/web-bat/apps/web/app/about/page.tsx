import Link from "next/link";

import { safeDate } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import { cleanCopy, getPublicSiteData, storySummary, themeName, themeNarrative } from "@/lib/public-site";

const refusals = [
  "No stale outrage pretending to be urgency.",
  "No decorative sass standing in for reporting.",
  "No vague institutional language when a sharper sentence will do.",
];

export default async function AboutPage() {
  const { publishedStories, activeThemes, latestCycle, researcherResult } = await getPublicSiteData();

  const latestEdition = latestCycle?.completed_at ? safeDate(latestCycle.completed_at) : "A fresh edition is loading now.";
  const freshestStories = publishedStories.slice(0, 3);
  const featuredThemes = activeThemes.slice(0, 3);
  const leadStory = freshestStories[0];

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="page-hero">
          <p className="hero-kicker">About BAT</p>
          <h1>Why this became a room, not just another politics page</h1>
          <p className="hero-note">
            I wanted somewhere to keep up with Trump-world without surrendering taste, memory, or authorship. So BAT became the room where
            I keep the reporting straight, the archive close, and the design warm enough that the work still feels like it belongs to a
            human being.
          </p>
        </section>

        <section className="process-strip">
          <article className="process-card">
            <span>Read</span>
            <p>
              {leadStory
                ? `Start with ${cleanCopy(leadStory.title)} if you want the quickest read on what I think matters right now.`
                : "Start with the newest lead when you want the quickest read on what I think matters right now."}
            </p>
          </article>
          <article className="process-card">
            <span>Roam</span>
            <p>
              {featuredThemes[0]
                ? `${themeName(featuredThemes[0])} is a good example of how I turn headline churn into a pattern I can actually hold onto.`
                : "The lane pages are where headline churn turns into patterns I can actually hold onto."}
            </p>
          </article>
          <article className="process-card">
            <span>Remember</span>
            <p>The archive exists so tomorrow's post does not have to pretend today was the first time any of this happened.</p>
          </article>
        </section>

        <section className="frontline-grid archive-stats">
          <article className="story-panel">
            <p className="section-kicker">Live shelf</p>
            <h3>{publishedStories.length}</h3>
            <p>Published stories currently carrying the site&apos;s memory instead of leaving the homepage to fend for itself.</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Active lanes</p>
            <h3>{activeThemes.length}</h3>
            <p>Recurring patterns still shaping what I read, file, and keep near the top of the desk.</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Latest edition</p>
            <h3>{latestCycle?.completed_at ? safeDate(latestCycle.completed_at) : "Live now"}</h3>
            <p>
              {researcherResult?.query_count ?? 0} research queries in the most recent sweep, because the site should feel current before
              it feels polished.
            </p>
          </article>
        </section>

        <div className="manifesto-grid">
          <article className="editorial-copy">
            <h2>What BAT is for</h2>
            <p>
              BAT is an anti-Trump site, yes, but more specifically it is the front page I would make for myself if I wanted one place
              that could hold urgency, memory, and taste at the same time.
            </p>
            <p>
              That means the homepage can be intimate, the archive can act like a shelf, and the notebook can stay public enough for you
              to understand how the place thinks.
            </p>
          </article>

          <article className="editorial-copy">
            <h2>What the voice is doing</h2>
            <p>
              I like Texas gloss, long memory, and a sentence that knows when to smile before it cuts. The tone can be amused, stylish,
              and a little wicked, but it only earns that attitude when the sourcing is solid.
            </p>
            <p>
              The site does not hide that a woman made choices here. That is part of the point. Precision and femininity are not enemies.
            </p>
          </article>

          <article className="editorial-copy">
            <h2>How the automation fits</h2>
            <p>
              I use the pipeline for sweeps, leads, theme clustering, and link curation, but I do not want the public site to feel like it
              was dumped straight out of a prompt. The machine can gather. The room still needs authorship.
            </p>
            <p>
              That is why the writing, framing, archive language, and page rhythm matter so much. The reader should feel the hand, not
              just the system.
            </p>
          </article>
        </div>

        <section className="column-band">
          <article className="story-panel">
            <p className="section-kicker">Start here</p>
            <h3>The pieces that show the site fastest</h3>
            <div className="stack-list compact">
              {freshestStories.map((story) => (
                <Link key={story.id} href={`/story/${story.slug}`} className="stack-item">
                  <strong>{cleanCopy(story.title)}</strong>
                  <span>{storySummary(story)}</span>
                </Link>
              ))}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">The lanes underneath it</p>
            <h3>The themes I keep returning to</h3>
            <div className="stack-list compact">
              {featuredThemes.map((theme) => (
                <Link key={theme.slug} href={`/themes/${theme.slug}`} className="stack-item">
                  <strong>{themeName(theme)}</strong>
                  <span>{themeNarrative(theme)}</span>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">What BAT refuses</p>
            <h3>I would rather leave blank space than fake density.</h3>
            <div className="stack-list compact">
              {refusals.map((item) => (
                <div key={item} className="stack-item static">
                  <strong>No thanks</strong>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Reader promise</p>
            <h3>Current first, memory intact, style still welcome.</h3>
            <p>
              If you come here often, the site should reward that. The archive should deepen the homepage, the themes should explain the
              obsessions, and each edition should feel like it belongs to the same person rather than a new anonymous machine.
            </p>
            <p>{latestEdition}</p>
            <div className="hero-actions">
              <Link href="/archive" className="button-link muted small">
                Read the archive
              </Link>
              <Link href="/workflow" className="button-link muted small">
                Open the notebook
              </Link>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
