import Link from "next/link";

import { safeDate } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import { cleanCopy, getPublicSiteData, humanizeSlug, storyQuote, storySummary, themeName, themeNarrative } from "@/lib/public-site";

function heatWidth(score?: number): string {
  const scaled = Math.max(16, Math.min(100, Math.round((score ?? 0) * 0.4)));
  return `${scaled}%`;
}

function heatLabel(score?: number): string {
  if ((score ?? 0) >= 220) {
    return "boiling";
  }
  if ((score ?? 0) >= 150) {
    return "hot";
  }
  if ((score ?? 0) >= 80) {
    return "active";
  }
  return "warming";
}

function storyTypeLabel(objectType?: string): string {
  if (!objectType) {
    return "BAT Dispatch";
  }
  return humanizeSlug(objectType);
}

export default async function HomePage() {
  const {
    snapshot,
    publishedStories,
    activeThemes,
    leadStory,
    latestCycle,
    researcherResult,
    opportunityBoard,
    queryPlan,
    watchlist,
    curatedLinks,
    queenLinks,
    liveSocialLines,
  } = await getPublicSiteData();

  const leadHref = leadStory ? `/story/${leadStory.slug}` : "/archive";
  const leadTitle = leadStory ? cleanCopy(leadStory.title) : "The next clean contradiction";
  const leadSummary = leadStory
    ? storySummary(leadStory)
    : "When the automation hesitates, I still want the page to feel lived in, current, and impossible to mistake for filler.";
  const leadQuote =
    storyQuote(leadStory) ||
    "I built BAT for the hour when the headlines are still moving but I already know which parts deserve memory.";

  const supportingStories = publishedStories.filter((story) => story.slug !== leadStory?.slug);
  const topShelf = supportingStories.slice(0, 4);
  const recentShelf = publishedStories.slice(0, 5);
  const liveWatch = watchlist.slice(0, 5);
  const liveThemes = activeThemes.slice(0, 4);
  const visibleQueries = queryPlan.slice(0, 6);
  const visibleOpportunities = opportunityBoard.slice(0, 4);
  const featuredSignal = curatedLinks[0];
  const extraSignals = curatedLinks.slice(1, 5);
  const featuredQueen = queenLinks[0];
  const extraQueen = queenLinks.slice(featuredQueen ? 1 : 0, 5);
  const lineShelf = liveSocialLines.slice(0, 4);
  const freshestSources = researcherResult?.source_quality_mix?.fresh_sources ?? 0;
  const highQualityKept = researcherResult?.source_quality_mix?.high_quality_kept ?? 0;
  const storyCount = publishedStories.length;
  const leadStoryCount = publishedStories.filter((story) => story.object_type === "lead_story").length;
  const themeTakeCount = publishedStories.filter((story) => story.object_type === "theme_take").length;
  const editionLabel =
    cleanCopy(snapshot?.layout_json?.edition) ||
    (latestCycle?.completed_at ? `Edition ${safeDate(latestCycle.completed_at)}` : "Fresh desk notes");
  const liveCycleLine = latestCycle?.completed_at
    ? `Latest research sweep closed ${safeDate(latestCycle.completed_at)}.`
    : "This page stays wired to the live cycle instead of posing as a static homepage.";
  const deskLane = liveThemes[0];
  const topQuery = cleanCopy(visibleQueries[0]);
  const topOpportunity = visibleOpportunities[0];
  const heroObjects = [
    {
      eyebrow: "The shelf",
      title: `${storyCount} pieces on the shelf`,
      copy: `${leadStoryCount} lead stories and ${themeTakeCount} theme takes are already filed, so the place remembers where it has been.`,
    },
    {
      eyebrow: topQuery ? "The question" : "The obsession",
      title: topQuery || (deskLane ? themeName(deskLane) : `${activeThemes.length} running obsessions`),
      copy: topQuery
        ? "I leave the search string visible because the questions matter as much as the finished take."
        : deskLane
          ? themeNarrative(deskLane)
          : `The hottest lanes right now are ${liveThemes.map((theme) => themeName(theme)).join(", ") || "still taking shape"}.`,
    },
    {
      eyebrow: featuredSignal ? "The tab" : "The receipts",
      title: cleanCopy(featuredSignal?.source_name) || `${freshestSources} fresh links`,
      copy: featuredSignal
        ? `${cleanCopy(featuredSignal.title) || "Untitled reporting pick"} is the outside piece I keep within reach because it sharpens the whole room.`
        : `${highQualityKept || freshestSources} reporting picks survived the latest sweep, which lets the page feel dressed without faking the homework.`,
    },
  ];
  const leadWhyNow =
    cleanCopy(snapshot?.layout_json?.lead?.why_now) ||
    cleanCopy(topOpportunity?.angle) ||
    leadSummary;
  const visitModes = [
    {
      href: leadHref,
      label: "If you want the fastest answer",
      title: leadTitle,
      copy: leadSummary,
    },
    {
      href: deskLane ? `/themes/${deskLane.slug}` : "/themes",
      label: "If you want the pattern underneath it",
      title: deskLane ? themeName(deskLane) : "The live lanes",
      copy: deskLane
        ? themeNarrative(deskLane)
        : "The lanes are where I sort the mess into recurring habits instead of treating every headline like it was born alone.",
    },
    {
      href: "/workflow",
      label: "If you want to see my tabs",
      title: topQuery || "The public notebook",
      copy: topQuery
        ? "I leave the search strings visible because I like readers knowing what I was pulling on before the prose showed up."
        : "The notebook keeps the research questions, the misses, and the almost-posts in public view.",
    },
  ];
  const deskHabits = [
    {
      title: "I keep the shelf warm",
      copy: `${storyCount} published pieces are already live, so landing here should feel like arriving mid-thought, not before the room is set.`,
    },
    {
      title: "I show the tabs",
      copy: topQuery
        ? `The first string still open tonight is “${topQuery},” because the questions matter as much as the finished take.`
        : "When the next sweep closes, the notebook will tell you exactly what I was searching for.",
    },
    {
      title: "I file by pattern",
      copy: deskLane
        ? `${themeName(deskLane)} is still staining the page, which tells you where I think the bigger story actually lives.`
        : "The lanes exist so the archive can hold more than one day at a time.",
    },
  ];

  return (
    <>
      <PublicHeader />
      <main className="shell home-shell">
        <section className="home-ribbon">
          <span className="banner-pill">{editionLabel}</span>
          <p>
            {cleanCopy(snapshot?.layout_json?.tagline) ||
              "An anti-Trump front page kept like a real room: shelf stocked, tabs open, memory intact."}
          </p>
        </section>

        <section className="edition-hero home-hero">
          <div className="edition-copy home-hero-copy">
            <div className="hero-brandline">
              <div className="brand-seal large" aria-hidden="true">
                <span>BAT</span>
              </div>
              <div>
                <p className="hero-brandnote">
                  BAT is the room I wanted whenever Trump-world started acting like everybody else had amnesia.
                </p>
                <div className="hero-brandchips">
                  <span>My front page</span>
                  <span>Reading table</span>
                  <span>Open notebook</span>
                </div>
              </div>
            </div>

            <p className="hero-kicker">{cleanCopy(snapshot?.layout_json?.edition_theme) || "A dressed-up desk with sharp elbows"}</p>
            <h2>I keep this place like a desk, a shelf, and a running text thread.</h2>
            <p className="hero-dek">
              When Trump, his people, his policy machinery, or the war around his power starts moving too fast, I want one room where the
              live story, the older memory, and the lines worth keeping can sit beside each other without turning into sludge.
            </p>
            <p className="hero-note">
              {liveCycleLine} The latest piece on the shelf is <strong>{leadTitle}</strong>, and the reason it is here is simple:
              {` ${leadWhyNow}`} I want the room to feel inhabited even when you arrive in the middle of the mess.
            </p>
            <div className="hero-actions">
              <Link href={leadHref} className="button-link">
                Read the lead
              </Link>
              <Link href="/about" className="button-link muted">
                Meet the room
              </Link>
            </div>
            <ul className="signal-chip-list">
              {liveThemes.map((theme) => (
                <li key={theme.slug}>{themeName(theme)}</li>
              ))}
            </ul>
            <p className="feature-footnote">If you walked in after I had already been reading for an hour, this is the version of the room I want you to find.</p>
          </div>

          <aside className="hero-sidebar home-hero-stack">
            <article className="metric-card home-callout">
              <span>On the desk right now</span>
              <strong>{leadTitle}</strong>
              <p>{leadSummary}</p>
            </article>

            <div className="hero-ornament-row">
              {heroObjects.map((item) => (
                <article key={item.title} className="hero-ornament-card">
                  <span>{item.eyebrow}</span>
                  <strong>{item.title}</strong>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="home-welcome-grid">
          <article className="story-panel note-card">
            <p className="section-kicker">A note from me</p>
            <h3>I built BAT because I wanted somewhere to put the receipts and the mood in the same room.</h3>
            <p>
              Too much political writing acts like a person choosing what matters is somehow embarrassing. I like the opposite. I want you
              to feel the reading habit, the filing instinct, and the fact that I am making decisions about what deserves the front table.
            </p>
            <p>
              Tonight that means keeping <strong>{leadTitle}</strong> close, watching {deskLane ? themeName(deskLane) : "the live lanes"},
              and leaving enough of the notebook visible that you can see how I got here.
            </p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Pick your way in</p>
            <h3>Three good doors into the room</h3>
            <div className="stack-list compact">
              {visitModes.map((mode) => (
                <Link key={mode.label} href={mode.href} className="stack-item">
                  <span className="signal-rank">{mode.label}</span>
                  <strong>{mode.title}</strong>
                  <span>{mode.copy}</span>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="home-promise-grid">
          {deskHabits.map((card) => (
            <article key={card.title} className="promise-card">
              <p className="section-kicker">House rule</p>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </section>

        <section className="frontline-grid home-frontline-grid">
          <article className="story-panel story-panel-feature">
            <p className="section-kicker">The story I would hand you first</p>
            <h3>
              <Link href={leadHref}>{leadTitle}</Link>
            </h3>
            <p>{leadSummary}</p>
            <blockquote className="story-quote">“{leadQuote}”</blockquote>
            <p className="story-hook">
              {leadStory
                ? `${storyTypeLabel(leadStory.object_type)} | ${leadStory.published_at ? safeDate(leadStory.published_at) : "Freshly filed"}`
                : "The shelf is ready for the next clean hit."}
            </p>
            <div className="hero-actions">
              <Link href={leadHref} className="button-link muted small">
                Read the piece
              </Link>
              <Link href="/archive" className="button-link muted small">
                Open the shelf
              </Link>
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Fresh on the shelf</p>
            <h3>The recent stack</h3>
            <p>I want a visitor to land here and immediately feel the site has already been busy without them.</p>
            <div className="stack-list">
              {topShelf.length ? (
                topShelf.map((story) => (
                  <Link key={story.id} href={`/story/${story.slug}`} className="stack-item">
                    <strong>{cleanCopy(story.title)}</strong>
                    <span>{storySummary(story)}</span>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">The next good pieces will land here as soon as the cycle gives me something worth keeping.</p>
              )}
            </div>
          </article>

          <article className="story-panel signal-salon-main">
            <p className="section-kicker">{cleanCopy(snapshot?.layout_json?.signal_links_label) || "Worth keeping open"}</p>
            <h3>The reading room</h3>
            {featuredSignal ? (
              <a href={featuredSignal.url ?? "#"} target="_blank" rel="noreferrer" className="stack-item signal-salon-lead">
                <span className="signal-rank">Front table pick</span>
                <strong>{cleanCopy(featuredSignal.title) || "Untitled reporting pick"}</strong>
                <span>
                  {cleanCopy(featuredSignal.source_name) || "news desk"} | quality {(featuredSignal.quality_score ?? 0).toFixed(1)}
                </span>
              </a>
            ) : (
              <div className="stack-empty">When a link truly earns its place, this is where it gets displayed like jewelry.</div>
            )}
            <div className="stack-list compact signal-salon-list">
              {extraSignals.map((link) => (
                <a key={`${link.url}-${link.title}`} href={link.url ?? "#"} target="_blank" rel="noreferrer" className="stack-item">
                  <strong>{cleanCopy(link.title) || "Untitled link"}</strong>
                  <span>{cleanCopy(link.source_name) || "news desk"}</span>
                </a>
              ))}
            </div>
          </article>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">Why this room feels human</p>
            <h3>I wanted habits, not widgets.</h3>
            <p>
              Politics sites often pretend objectivity means sanding off every sign of authorship. I wanted the opposite: a page where the
              sourcing is serious, but the reader can still feel a person deciding what belongs where.
            </p>
            <p>
              That is why the archive matters, the notebook is public, the taste page exists, and the latest links are curated like a real
              reading table. The point is not just to publish. It is to build a place.
            </p>
            <div className="hero-actions">
              <Link href="/workflow" className="button-link muted small">
                See the notebook
              </Link>
              <Link href="/the-cat" className="button-link muted small">
                See the taste
              </Link>
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">What is shaping the page tonight</p>
            <h3>The live lanes</h3>
            <div className="heat-list">
              {liveWatch.length ? (
                liveWatch.map((theme) => (
                  <Link key={theme.slug ?? theme.name} href={theme.slug ? `/themes/${theme.slug}` : "/themes"} className="heat-row">
                    <div className="heat-copy">
                      <strong>{cleanCopy(theme.name) || "Untitled lane"}</strong>
                      <span>{cleanCopy(theme.description) || "A recurring BAT lane that keeps proving it is not done with us yet."}</span>
                    </div>
                    <div className="heat-meter" aria-hidden="true">
                      <div className="heat-bar" style={{ width: heatWidth(theme.active_score) }} />
                    </div>
                    <span className="signal-rank">
                      {heatLabel(theme.active_score)} | {(theme.active_score ?? 0).toFixed(2)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">The next active patterns will gather here once the live cycle starts staining the page.</p>
              )}
            </div>
          </article>
        </section>

        <section className="column-band home-columns">
          <article className="story-panel">
            <p className="column-eyebrow">Freshly filed</p>
            <h3>What went up lately</h3>
            <p className="column-note">A personal site should have a visible pulse. These are the posts proving the lights are on.</p>
            <div className="stack-list compact">
              {recentShelf.length ? (
                recentShelf.map((story) => (
                  <Link key={story.id} href={`/story/${story.slug}`} className="stack-item">
                    <strong>{cleanCopy(story.title)}</strong>
                    <span>{storySummary(story)}</span>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">The shelf is ready. I am waiting on the next clean post.</p>
              )}
            </div>
          </article>

          <article className="story-panel">
            <p className="column-eyebrow">Lanes I cannot quit</p>
            <h3>The patterns under the headlines</h3>
            <p className="column-note">The theme index is the best shortcut to how my brain is organizing the mess.</p>
            <div className="stack-list compact">
              {liveThemes.length ? (
                liveThemes.map((theme) => (
                  <Link key={theme.slug} href={`/themes/${theme.slug}`} className="stack-item">
                    <strong>{themeName(theme)}</strong>
                    <span>{themeNarrative(theme)}</span>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">The active lanes will collect here as soon as the site has a pattern worth naming.</p>
              )}
            </div>
          </article>

          <article className="story-panel">
            <p className="column-eyebrow">Queries from tonight</p>
            <h3>What I am still pulling on</h3>
            <p className="column-note">The notebook stays visible because I like readers seeing the questions before the finished prose arrives.</p>
            <div className="stack-list compact">
              {visibleQueries.length ? (
                visibleQueries.map((query) => (
                  <div key={query} className="stack-item static">
                    <strong>{cleanCopy(query)}</strong>
                    <span>The search string tells you exactly where my attention keeps snagging.</span>
                  </div>
                ))
              ) : (
                <p className="stack-empty">Fresh queries from the latest sweep will show up here once the next cycle closes.</p>
              )}
            </div>
          </article>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">What I was working through tonight</p>
            <h3>The notebook stays open on purpose</h3>
            <div className="stack-list compact">
              <div className="stack-item static">
                <strong>Searches I sent out</strong>
                <span>
                  {researcherResult?.query_count ?? visibleQueries.length} queries across {researcherResult?.themes_active ?? activeThemes.length}{" "}
                  active lanes{topQuery ? `, starting with ${topQuery}.` : "."}
                </span>
              </div>
              <div className="stack-item static">
                <strong>Receipts I kept</strong>
                <span>
                  {freshestSources} fresh sources kept, with {highQualityKept} high-quality links still standing after the pass.
                </span>
              </div>
              {visibleOpportunities.map((item) => (
                <div key={`${item.slug}-${item.query_hint}`} className="stack-item static">
                  <strong>{cleanCopy(item.theme) || humanizeSlug(item.slug) || "Angle still bugging me"}</strong>
                  <span>{cleanCopy(item.angle || item.query_hint) || "Still hot enough that I have not closed the tab."}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">What I would text first</p>
            <h3>The line shelf</h3>
            <div className="social-cards">
              {lineShelf.length ? (
                lineShelf.map((line, index) => (
                  <article key={`${index}-${line}`} className="social-card">
                    <span>line {index + 1}</span>
                    <p>{line}</p>
                  </article>
                ))
              ) : (
                <p className="stack-empty">The fastest lines collect here once the latest cycle produces something worth stealing.</p>
              )}
            </div>
          </article>
        </section>

        <section className="queen-band queen-band-magical">
          <div className="queen-copy">
            <p className="section-kicker">{cleanCopy(snapshot?.layout_json?.queen_label) || "Tabs I refuse to close"}</p>
            <h3>{cleanCopy(snapshot?.layout_json?.queen_note) || "The side table matters too."}</h3>
            <p className="queen-subcopy">
              The extra links stay secondary, but they matter. I like a homepage where the main story, the archive, and the outside
              reporting can all sit near one another like parts of the same conversation.
            </p>
            <div className="hero-actions">
              <Link href="/themes" className="button-link muted small">
                Browse the lanes
              </Link>
              <Link href="/archive" className="button-link muted small">
                Read the archive
              </Link>
            </div>
          </div>

          <div className="queen-links queen-links-magical">
            {featuredQueen ? (
              <a href={featuredQueen.url ?? "#"} target="_blank" rel="noreferrer" className="queen-link queen-link-feature">
                <strong>{cleanCopy(featuredQueen.title) || "Featured BAT pick"}</strong>
                <span>{cleanCopy(featuredQueen.source_name) || "news desk"}</span>
              </a>
            ) : null}

            <div className="queen-link-stack">
              {(extraQueen.length ? extraQueen : queenLinks).length ? (
                (extraQueen.length ? extraQueen : queenLinks).map((item) => (
                  <a key={`${item.url}-${item.title}`} href={item.url ?? "#"} target="_blank" rel="noreferrer" className="queen-link">
                    <strong>{cleanCopy(item.title) || "Untitled source"}</strong>
                    <span>{cleanCopy(item.source_name) || "news desk"}</span>
                  </a>
                ))
              ) : (
                <p className="stack-empty">The extra tabs fill in once the cycle offers something too useful or too delicious to close.</p>
              )}
            </div>
          </div>
        </section>

        <section className="home-closing-note">
          <p>
            BAT is the version of political coverage I actually want to visit: current enough to keep up, personal enough to remember, and
            alive enough that there is always another shelf, tab, or line worth opening.
          </p>
          <p className="closing-signoff">Come for the latest post, stay for the shelf and the tabs.</p>
          <div className="hero-actions">
            <Link href="/archive" className="button-link">
              Read more posts
            </Link>
            <Link href="/about" className="button-link muted">
              Why I make this
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
