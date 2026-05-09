import Link from "next/link";

import { safeDate } from "@/lib/api";
import { cleanCopy, getPublicSiteData, storySummary, themeName } from "@/lib/public-site";

export async function PublicHeader() {
  const { leadStory, activeThemes, latestCycle, publishedStories, queryPlan, snapshot } = await getPublicSiteData();
  const editionStamp = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date());
  const leadTitle = leadStory ? cleanCopy(leadStory.title) : "The next clean contradiction";
  const leadHref = leadStory?.slug ? `/story/${leadStory.slug}` : "/archive";
  const hottestTheme = activeThemes[0];
  const themeHref = hottestTheme?.slug ? `/themes/${hottestTheme.slug}` : "/themes";
  const deskNote =
    cleanCopy(snapshot?.layout_json?.lead?.why_now) ||
    (leadStory ? storySummary(leadStory) : "") ||
    "I keep the page current enough that you can drop in cold and still find a sharp place to start.";
  const notebookPrompt =
    cleanCopy(queryPlan[0]) ||
    cleanCopy(snapshot?.layout_json?.lead_angle) ||
    "What Trump-world is trying to pass off as normal this week.";
  const freshnessLine = latestCycle?.completed_at
    ? `Latest research sweep closed ${safeDate(latestCycle.completed_at)} and the shelf is holding ${publishedStories.length} published pieces.`
    : "The page is live now, with the archive, notebook, and reading table all updating against the same cycle.";

  return (
    <header className="shell public-header">
      <div className="masthead">
        <div className="masthead-topline">
          <div className="brand-lockup">
            <div className="brand-seal" aria-hidden="true">
              <span>BAT</span>
            </div>
            <div className="brand-copy">
              <p className="kicker">A source-backed Trump research and commentary blog</p>
              <p className="brand-slogan">long-form pieces, short-form dispatches, and a public notebook built from linked reporting</p>
            </div>
          </div>
          <p className="edition-stamp">Updated {editionStamp}</p>
        </div>
        <h1>Blondes Against Trump</h1>
        <p className="subhed">
          This is a Trump research blog with a point of view. I track the filings, the spin, the linked reporting, and the recurring
          patterns, then file the sharpest read in public.
        </p>
        <div className="brand-flags">
          <span>Linked reporting</span>
          <span>Long-form and short-form</span>
          <span>Public notebook</span>
        </div>
        <p className="masthead-note">Specific, witty, source-led, and only cruel when the receipts make it unavoidable.</p>
        <div className="masthead-deskline">
          <article className="desk-note-panel">
            <p className="section-kicker">Research note</p>
            <h2>{leadTitle}</h2>
            <p>{deskNote}</p>
            <div className="desk-note-links">
              <Link href={leadHref}>Read the lead</Link>
              <Link href={themeHref}>{hottestTheme ? themeName(hottestTheme) : "Browse the lanes"}</Link>
            </div>
          </article>

          <div className="header-entry-grid">
            <Link href={leadHref} className="entry-card">
              <span>Start here</span>
              <strong>{leadTitle}</strong>
              <p>The cleanest way into whatever I think matters most right now.</p>
            </Link>
            <Link href={themeHref} className="entry-card">
              <span>Lane I keep circling</span>
              <strong>{hottestTheme ? themeName(hottestTheme) : "The pattern board"}</strong>
              <p>The recurring logic under the headline noise.</p>
            </Link>
            <Link href="/workflow" className="entry-card">
              <span>Notebook tab</span>
              <strong>{notebookPrompt}</strong>
              <p>The exact string or angle still snagging my attention.</p>
            </Link>
          </div>
        </div>
      </div>
      <nav className="utility">
        <Link href="/">Desk</Link>
        <Link href="/archive">Shelf</Link>
        <Link href="/themes">Lanes</Link>
        <Link href="/workflow">Notebook</Link>
        <Link href="/about">Why BAT</Link>
        <Link href="/the-cat">Taste</Link>
        <Link href="/admin" className="utility-admin-link">
          Studio
        </Link>
      </nav>
      <div className="banner">
        <span className="banner-pill">Edition note</span>
        {freshnessLine} Every story on this site is supposed to show its receipts, not just its vibe.
      </div>
    </header>
  );
}
