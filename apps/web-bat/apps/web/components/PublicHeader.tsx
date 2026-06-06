import Link from "next/link";

import { safeDate } from "@/lib/api";
import { cleanCopy, getPublicSiteData, storySummary, themeName, type PublicSiteData } from "@/lib/public-site";

type PublicHeaderProps = {
  data?: PublicSiteData;
};

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
    "Come in through the freshest contradiction; I keep the receipts close and the perfume off the evidence.";
  const notebookPrompt =
    cleanCopy(queryPlan[0]) ||
    cleanCopy(snapshot?.layout_json?.lead_angle) ||
    "What Trump-world is trying to pass off as normal this week.";
  const freshnessLine = latestCycle?.completed_at
    ? `Latest research sweep closed ${safeDate(latestCycle.completed_at)}; ${publishedStories.length} published pieces are on the shelf.`
    : "The room is open: fresh reads, linked receipts, and the archive close enough to check.";
  const channelLine = activeThemes
    .slice(0, 3)
    .map((theme) => themeName(theme))
    .filter(Boolean)
    .join(" / ");
  const receiptCount = curatedLinks.length;
  const queryCount = queryPlan.length || 30;

  return (
    <header className="shell public-header">
      <div className="site-topbar">
        <Link href="/" className="brand-mini" aria-label="Blondes Against Trump home">
          <span className="brand-mini-seal">BAT</span>
          <span className="brand-mini-copy">
            <span>Blondes Against Trump</span>
            <span className="brand-mini-line">Woman-owned politics. Receipts are not optional.</span>
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
          <p className="masthead-title">Search wide. Narrow hard.</p>
          <p className="subhed">
            An anti-Trump publication run by one woman with a long memory, a good lamp, and no patience for power
            pretending it misplaced the evidence.
          </p>
          <div className="masthead-signal-strip" aria-label="BAT desk signals">
            <span>Research lanes</span>
            <span>Source ledger</span>
            <span>Writing queue</span>
          </div>
          <div className="brand-flags">
            <span>Woman-owned</span>
            <span>{queryCount}-search sweep</span>
            <span>{channelLine || "Trump-world watch"}</span>
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
        <span className="banner-pill">On the table</span>
        {freshnessLine} {receiptCount ? `${receiptCount} source links are worth keeping open.` : "New receipts are still being sorted."}
      </div>
    </header>
  );
}
