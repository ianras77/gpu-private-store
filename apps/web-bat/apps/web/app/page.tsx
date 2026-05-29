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

const merchLines = [
  "Bad at tyranny",
  "Blonde, not blind",
  "Receipts are my love language",
  "Big hair. Bigger receipts.",
  "Good hair, better evidence",
  "All are welcome. Bullshit is not.",
  "Make lying embarrassing again",
  "Bat signal for bad men",
  "Cute outfit. Clear threat model.",
];

const merchPreviewCards = [
  {
    label: "Shirt lockup",
    title: "Blonde / Not / Blind",
    copy: "Three words, high contrast, impossible to misread from across the room.",
    tone: "tee",
  },
  {
    label: "Poster line",
    title: "Bad at tyranny",
    copy: "A BAT pun with bite: funny first, political second, printable always.",
    tone: "poster",
  },
  {
    label: "Sticker hit",
    title: "Receipts are my love language",
    copy: "Smart, flirtatious, and still centered on proof.",
    tone: "sticker",
  },
];

export default async function HomePage() {
  const siteData = await getPublicSiteData();
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
  } = siteData;

  const leadHref = leadStory ? `/story/${leadStory.slug}` : "/archive";
  const leadTitle = leadStory ? cleanCopy(leadStory.title) : "The next clean contradiction";
  const leadSummary = leadStory
    ? storySummary(leadStory)
    : "The next finished piece will land here with a point of view, a source trail, and enough snap to deserve the front page.";
  const leadQuote =
    storyQuote(leadStory) ||
    "The work is serious. The delivery is allowed to have perfume, boots, and a little edge.";
  const latestDate = leadStory?.published_at || leadStory?.created_at;
  const latestStoryType = storyTypeLabel(leadStory?.object_type);

  const latestPosts = publishedStories.slice(0, 6);
  const channelCards = activeThemes.slice(0, 6);
  const heatMap = (watchlist.length ? watchlist : activeThemes).slice(0, 6);
  const visibleQueries = queryPlan.slice(0, 5);
  const visibleOpportunities = opportunityBoard.slice(0, 4);
  const receiptLinks = (curatedLinks.length ? curatedLinks : queenLinks).slice(0, 5);
  const socialLines = liveSocialLines.slice(0, 4);
  const printableLines = merchLines;
  const topChannel = channelCards[0];
  const topQuery = cleanCopy(visibleQueries[0]);
  const storyCount = publishedStories.length;
  const leadStoryCount = publishedStories.filter((story) => story.object_type === "lead_story").length;
  const themeTakeCount = publishedStories.filter((story) => story.object_type === "theme_take").length;
  const freshestSources = researcherResult?.source_quality_mix?.fresh_sources ?? 0;
  const highQualityKept = researcherResult?.source_quality_mix?.high_quality_kept ?? 0;
  const editionLabel =
    cleanCopy(snapshot?.layout_json?.edition) ||
    (latestCycle?.completed_at ? `Edition ${safeDate(latestCycle.completed_at)}` : "Live edition");
  const heroLine =
    cleanCopy(snapshot?.layout_json?.tagline) ||
    "A cowgirl-sharp anti-Trump blog with Texas gloss, feminine nerve, and receipts close enough to slap on the table.";

  const dataCards = [
    {
      label: "Dispatches",
      value: storyCount.toString(),
      copy: `${leadStoryCount} lead stories and ${themeTakeCount} channel takes are live on the shelf.`,
    },
    {
      label: "Channels",
      value: activeThemes.length.toString(),
      copy: topChannel ? `${themeName(topChannel)} is setting the room temperature.` : "The channel board is warming up.",
    },
    {
      label: "Receipts",
      value: (receiptLinks.length || highQualityKept || freshestSources).toString(),
      copy: receiptLinks.length ? "Outside links are dressed and on the reading table." : "Fresh links will surface after the next sweep.",
    },
    {
      label: "Notebook",
      value: (researcherResult?.query_count ?? visibleQueries.length).toString(),
      copy: topQuery ? `First tab open: ${topQuery}` : "Queries will appear when the next research pass closes.",
    },
  ];

  return (
    <>
      <PublicHeader data={siteData} />
      <main className="shell home-shell redesigned-home">
        <section className="hero-board">
          <article className="home-hero-primary">
            <p className="hero-kicker">{editionLabel}</p>
            <h1>Cowgirl politics with lipstick on the glass and receipts on the table.</h1>
            <p className="hero-dek">{heroLine}</p>
            <p className="hero-note">
              BAT is personal, source-backed, anti-Trump, and built to feel like a real cowgirl blog with a house style people can wear.
              The writing leads. The merch language follows: smart mouth, clean proof, sharp silhouette.
            </p>
            <div className="hero-actions">
              <Link href={leadHref} className="button-link">
                Read the latest
              </Link>
              <Link href="/themes" className="button-link muted">
                Browse channels
              </Link>
            </div>
          </article>

          <aside className="lead-ticket">
            <p className="section-kicker">Latest dispatch</p>
            <h2>
              <Link href={leadHref}>{leadTitle}</Link>
            </h2>
            <p>{leadSummary}</p>
            <blockquote>{leadQuote}</blockquote>
            <div className="lead-ticket-meta">
              <span>{latestStoryType}</span>
              <span>{latestDate ? safeDate(latestDate) : "Ready for the next file"}</span>
            </div>
          </aside>
        </section>

        <section className="data-strip" aria-label="Live site data">
          {dataCards.map((card) => (
            <article key={card.label} className="data-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.copy}</p>
            </article>
          ))}
        </section>


        <section className="brand-shop-window" aria-label="BAT merch direction">
          <div className="brand-shop-copy">
            <p className="section-kicker">Merchable by design</p>
            <h2>The BAT signal is a look now.</h2>
            <p>
              The public face needs to work as a blog, a sticker, a shirt, and a quote card. So the visual system now favors
              loud little phrases, tighter lockups, and printable blocks that can move from front page to merch without losing the point.
            </p>
            <div className="brand-shop-tags">
              <span>Smart</span>
              <span>Fun</span>
              <span>Sexy</span>
              <span>Receipt-backed</span>
            </div>
          </div>
          <div className="merch-preview-grid" aria-label="BAT printable concept cards">
            {merchPreviewCards.map((card) => (
              <article key={card.title} className={`merch-preview-card ${card.tone}`}>
                <span>{card.label}</span>
                <strong>{card.title}</strong>
                <p>{card.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="blog-and-heat">
          <article className="story-panel latest-blog-list">
            <div className="section-heading">
              <p className="section-kicker">Fresh writing</p>
              <h2>The latest posts</h2>
              <p>Newest first, voice intact, with the strongest read close enough to grab.</p>
            </div>
            <div className="post-list">
              {latestPosts.length ? (
                latestPosts.map((story) => (
                  <Link key={story.id} href={`/story/${story.slug}`} className="post-row">
                    <span>{storyTypeLabel(story.object_type)}</span>
                    <strong>{cleanCopy(story.title)}</strong>
                    <p>{storySummary(story)}</p>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">The shelf is built. The next post will land here when it has earned the front page.</p>
              )}
            </div>
          </article>

          <aside className="story-panel heat-map-panel">
            <div className="section-heading">
              <p className="section-kicker">Channel heat</p>
              <h2>What is hot right now</h2>
              <p>Heat is the shortcut: which recurring Trump-world patterns are loudest in the current read.</p>
            </div>
            <div className="heat-list">
              {heatMap.length ? (
                heatMap.map((theme) => (
                  <Link key={theme.slug ?? theme.name} href={theme.slug ? `/themes/${theme.slug}` : "/themes"} className="heat-row">
                    <div className="heat-copy">
                      <strong>{cleanCopy(theme.name) || "Untitled channel"}</strong>
                      <span>{cleanCopy(theme.description) || "A BAT channel still warm enough to keep watching."}</span>
                    </div>
                    <div className="heat-meter" aria-hidden="true">
                      <div className="heat-bar" style={{ width: heatWidth(theme.active_score) }} />
                    </div>
                    <span className="signal-rank">
                      {heatLabel(theme.active_score)} / {(theme.active_score ?? 0).toFixed(2)}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="stack-empty">The heat map will fill in once the live channel board has fresh signal.</p>
              )}
            </div>
          </aside>
        </section>

        <section className="channel-showcase">
          <div className="section-heading section-heading-wide">
            <p className="section-kicker">Channels</p>
            <h2>The beats I keep circling</h2>
            <p>Not categories for decoration. Channels are how the blog remembers what Trump-world keeps trying to rebrand.</p>
          </div>
          <div className="channel-grid">
            {channelCards.length ? (
              channelCards.map((theme) => (
                <Link key={theme.slug} href={`/themes/${theme.slug}`} className="channel-card">
                  <span>Heat {(theme.active_score ?? 0).toFixed(2)}</span>
                  <strong>{themeName(theme)}</strong>
                  <p>{themeNarrative(theme)}</p>
                </Link>
              ))
            ) : (
              <article className="channel-card static">
                <span>Channels warming</span>
                <strong>The next pass will name the patterns.</strong>
                <p>Once the theme board updates, this section becomes the living channel guide.</p>
              </article>
            )}
          </div>
        </section>

        <section className="reading-room-grid">
          <article className="story-panel receipts-panel">
            <div className="section-heading">
              <p className="section-kicker">Reading table</p>
              <h2>Receipts worth keeping open</h2>
              <p>Outside reporting stays visible because attitude without receipts is just perfume in a press room.</p>
            </div>
            <div className="receipt-list">
              {receiptLinks.length ? (
                receiptLinks.map((link) => (
                  <a key={`${link.url}-${link.title}`} href={link.url ?? "#"} target="_blank" rel="noreferrer" className="receipt-row">
                    <strong>{cleanCopy(link.title) || "Untitled reporting pick"}</strong>
                    <span>
                      {cleanCopy(link.source_name) || "news desk"}
                      {link.quality_score ? ` / quality ${link.quality_score.toFixed(1)}` : ""}
                    </span>
                  </a>
                ))
              ) : (
                <p className="stack-empty">Links from the next curation pass will land here when they are worth the table space.</p>
              )}
            </div>
          </article>

          <article className="story-panel line-shelf-panel">
            <div className="section-heading">
              <p className="section-kicker">Group chat shelf</p>
              <h2>Lines with legs</h2>
              <p>Short, portable, a little wicked, and useful when somebody needs the point fast.</p>
            </div>
            <div className="line-shelf">
              {socialLines.length ? (
                socialLines.map((line, index) => (
                  <p key={`${index}-${line}`}>
                    <span>Line {index + 1}</span>
                    {line}
                  </p>
                ))
              ) : (
                <p className="stack-empty">The fastest lines collect here once the latest cycle has something worth stealing.</p>
              )}
            </div>
          </article>
        </section>


        <section className="slogan-wall" aria-label="BAT merch slogan wall">
          <div className="section-heading section-heading-wide">
            <p className="section-kicker">Lines worth printing</p>
            <h2>Portable, pithy, and a little dangerous.</h2>
            <p>These are the fragments built for tees, captions, stickers, and future writing prompts.</p>
          </div>
          <div className="slogan-grid">
            {printableLines.map((line, index) => (
              <article key={`${index}-${line}`} className="slogan-tile">
                <span>BAT {String(index + 1).padStart(2, "0")}</span>
                <strong>{line}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="notebook-proof">
          <div className="section-heading section-heading-wide">
            <p className="section-kicker">Open notebook</p>
            <h2>The tabs behind the latest take</h2>
            <p>The process is no longer the sales pitch. It is the proof layer: queries, opportunities, and receipts when you want to look closer.</p>
          </div>
          <div className="notebook-grid">
            <article>
              <span>First search string</span>
              <strong>{topQuery || "Waiting on the next live sweep"}</strong>
              <p>{topQuery ? "The question tells you where the writing started pulling." : "New query language appears here after a research pass closes."}</p>
            </article>
            <article>
              <span>Sources kept</span>
              <strong>{freshestSources} fresh / {highQualityKept} high quality</strong>
              <p>The data stays readable, but the writing stays in charge.</p>
            </article>
            {visibleOpportunities.slice(0, 2).map((item) => (
              <article key={`${item.slug}-${item.query_hint}`}>
                <span>{cleanCopy(item.theme) || humanizeSlug(item.slug) || "Opportunity"}</span>
                <strong>{cleanCopy(item.angle || item.query_hint) || "Angle still hot"}</strong>
                <p>This one is still tugging on the sleeve.</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-closing-note">
          <p>
            BAT should feel like a sharp personal blog first: current enough to keep up, stylish enough to remember, and bold enough
            to jump from headline to shirt without getting diluted.
          </p>
          <p className="closing-signoff">Boots on. Woman-led. Smart mouth. Receipts in reach.</p>
          <div className="hero-actions">
            <Link href="/archive" className="button-link">
              Read the archive
            </Link>
            <Link href="/about" className="button-link muted">
              Why BAT exists
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
