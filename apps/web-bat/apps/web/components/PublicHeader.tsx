import Link from "next/link";

import { safeDate } from "@/lib/api";
import { cleanCopy, getPublicSiteData, storySummary, themeName, type PublicSiteData } from "@/lib/public-site";

type PublicHeaderProps = {
  data?: PublicSiteData;
};

const brandPuns = ["Blonde, not blind", "Bad at tyranny", "Receipts are my love language", "All are welcome. Bullshit is not."];

export async function PublicHeader({ data }: PublicHeaderProps = {}) {
  const { leadStory, activeThemes, latestCycle, publishedStories, queryPlan, snapshot, curatedLinks } = data ?? (await getPublicSiteData());
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
  const channelLine = activeThemes
    .slice(0, 3)
    .map((theme) => themeName(theme))
    .filter(Boolean)
    .join(" / ");
  const receiptCount = curatedLinks.length;

  return (
    <header className="shell public-header">
      <div className="site-topbar">
        <Link href="/" className="brand-mini" aria-label="Blondes Against Trump home">
          <span className="brand-mini-seal">BAT</span>
          <span className="brand-mini-copy">
            <span>Blondes Against Trump</span>
            <span className="brand-mini-line">All are welcome. Receipts are not optional.</span>
          </span>
        </Link>
        <nav className="utility" aria-label="Primary navigation">
          <Link href="/">Latest</Link>
          <Link href="/archive">Archive</Link>
          <Link href="/themes">Channels</Link>
          <Link href="/workflow">Notebook</Link>
          <Link href="/about">About</Link>
          <Link href="/the-cat">Taste</Link>
          <Link href="/admin" className="utility-admin-link" prefetch={false}>
            Studio
          </Link>
        </nav>
      </div>

      <div className="masthead">
        <div className="masthead-art" aria-hidden="true">
          <img src="/bat-logo.jpg" alt="" />
        </div>

        <div className="masthead-copy">
          <p className="kicker">Updated {editionStamp}</p>
          <p className="masthead-title">Big hair. Bigger receipts.</p>
          <p className="subhed">
            A cowgirl-sharp anti-Trump blog for linked reporting, political heat, and the kind of feminine authority that
            walks in with boots on and receipts ready.
          </p>
          <div className="masthead-merch-lines" aria-label="BAT house lines">
            <span>Smart mouth</span>
            <span>Sharp politics</span>
            <span>Good hair, better evidence</span>
          </div>
          <div className="brand-flags">
            <span>Cowgirl editorial</span>
            <span>Receipts first</span>
            <span>{channelLine || "Live channels"}</span>
          </div>
        </div>

        <aside className="masthead-latest">
          <p className="section-kicker">Start here</p>
          <Link href={leadHref}>{leadTitle}</Link>
          <p>{deskNote}</p>
          <div className="masthead-latest-links">
            <Link href={themeHref}>{hottestTheme ? themeName(hottestTheme) : "Browse channels"}</Link>
            <Link href="/workflow">{notebookPrompt ? "Open notebook" : "See the tabs"}</Link>
          </div>
        </aside>
      </div>

      <div className="banner header-ticker">
        <span className="banner-pill">Live desk</span>
        {freshnessLine} {receiptCount ? `${receiptCount} outside receipts are on the reading table.` : "The reading table is warming up."}
      </div>
      <div className="brand-pun-strip" aria-label="Blondes Against Trump slogans">
        {brandPuns.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
    </header>
  );
}
