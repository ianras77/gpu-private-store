import Link from "next/link";

import { safeDate } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import {
  cleanCopy,
  getPublicSiteData,
  humanizeSlug,
  storyQuote,
  storySummary,
  themeName,
  themeNarrative,
  type Editorial,
  type Opportunity,
  type PipelineCycle,
  type PipelineStage,
} from "@/lib/public-site";

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

function cycleStage(cycle: PipelineCycle | null, stageName: string): PipelineStage | undefined {
  return cycle?.stages?.find((stage) => stage.stage === stageName && stage.event === "stage_completed");
}

function cycleStageStarted(cycle: PipelineCycle | null, stageName: string): boolean {
  return Boolean(cycle?.stages?.some((stage) => stage.stage === stageName && stage.event === "stage_started"));
}

function cycleStatus(cycle: PipelineCycle | null, stageName: string): string {
  if (cycleStage(cycle, stageName)) {
    return "complete";
  }
  if (cycleStageStarted(cycle, stageName)) {
    return "running";
  }
  return "queued";
}

function distributionRows(distribution?: Record<string, number>, limit = 4): Array<[string, number]> {
  return Object.entries(distribution ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function storyHref(story: Pick<Editorial, "slug">): string {
  return story.slug ? `/story/${story.slug}` : "/archive";
}

export default async function HomePage() {
  const siteData = await getPublicSiteData();
  const {
    snapshot,
    publishedStories,
    draftStories,
    activeThemes,
    leadStory,
    latestCycle,
    researcherResult,
    analystResult,
    writerResult,
    queenResult,
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
    : "I will put the next finished piece here once it has a point of view, a source trail, and enough snap to deserve the front page.";
  const leadQuote =
    storyQuote(leadStory) ||
    "I am not chasing volume. I am chasing the receipt that makes the next sentence inevitable.";
  const latestDate = leadStory?.published_at || leadStory?.created_at;
  const latestStoryType = storyTypeLabel(leadStory?.object_type);

  const latestPosts = publishedStories.slice(0, 5);
  const draftQueue = draftStories.slice(0, 6);
  const writerSlate = writerResult?.story_slate ?? [];
  const writingQueue = writerSlate.length
    ? writerSlate.slice(0, 6).map((story) => ({
        key: story.id ?? story.slug ?? story.title ?? "writer-slate",
        title: cleanCopy(story.title) || "Untitled writing pass",
        href: story.slug ? `/story/${story.slug}` : "/archive",
        status: cleanCopy(story.status) || "draft",
        detail: cleanCopy(story.why_now || story.selected_angle) || "A live angle from the writing pass.",
      }))
    : draftQueue.map((story) => ({
        key: story.id,
        title: cleanCopy(story.title) || "Untitled draft",
        href: storyHref(story),
        status: cleanCopy(story.status) || "draft",
        detail: storySummary(story),
      }));

  const channelCards = activeThemes.slice(0, 6);
  const heatMap = (watchlist.length ? watchlist : activeThemes).slice(0, 6);
  const visibleQueries = queryPlan.slice(0, 6);
  const visibleOpportunities = opportunityBoard.slice(0, 6);
  const researchLaneItems: Opportunity[] = visibleOpportunities.length
    ? visibleOpportunities
    : visibleQueries.map((query) => ({ angle: query, query_hint: query }));
  const receiptLinks = (curatedLinks.length ? curatedLinks : queenLinks).slice(0, 6);
  const socialLines = liveSocialLines.slice(0, 4);
  const topChannel = channelCards[0];
  const topQuery = cleanCopy(visibleQueries[0]);
  const researchCount = researcherResult?.query_count ?? visibleQueries.length;
  const freshestSources = researcherResult?.source_quality_mix?.fresh_sources ?? 0;
  const highQualityKept = researcherResult?.source_quality_mix?.high_quality_kept ?? 0;
  const briefCount = analystResult?.brief_count ?? 0;
  const editionLabel =
    cleanCopy(snapshot?.layout_json?.edition) ||
    (latestCycle?.completed_at ? `Edition ${safeDate(latestCycle.completed_at)}` : "Live edition");
  const heroLine =
    cleanCopy(snapshot?.layout_json?.tagline) ||
    "Anti-Trump politics with a long memory: I search wide, verify hard, and write only when the receipts start talking.";

  const dataCards = [
    {
      label: "Search sweep",
      value: (researchCount || 30).toString(),
      copy: "Thirty searches across legal collisions, war powers, oil shocks, patronage, and every institutional tell Trump-world tries to launder.",
    },
    {
      label: "Sources kept",
      value: (highQualityKept || freshestSources).toString(),
      copy: freshestSources ? `${freshestSources} fresh sources stayed on the table.` : "Fresh sources stay close until the argument can hold them.",
    },
    {
      label: "Analysis briefs",
      value: briefCount.toString(),
      copy: "Briefs separate real pressure from noise before a line gets dressed up.",
    },
    {
      label: "Writing queue",
      value: writingQueue.length.toString(),
      copy: "Drafts wait here until they have an argument, a source trail, and a reason to exist.",
    },
  ];

  const pulseCards = [
    {
      label: "Research",
      status: cycleStatus(latestCycle, "researcher"),
      metric: `${researchCount || 0} searches`,
      detail: `${highQualityKept || freshestSources || 0} usable source signals kept under the lamp.`,
    },
    {
      label: "Analysis",
      status: cycleStatus(latestCycle, "analyst"),
      metric: `${briefCount} briefs`,
      detail: "Tone, source role, and story target have to line up before the attitude earns its keep.",
    },
    {
      label: "Writing",
      status: cycleStatus(latestCycle, "writer"),
      metric: `${writingQueue.length} in queue`,
      detail: "The draft has to say something sharper than the outrage everybody already brought with them.",
    },
    {
      label: "Curation",
      status: cycleStatus(latestCycle, "queen"),
      metric: `${receiptLinks.length || queenResult?.curated_links?.length || 0} links`,
      detail: "Links and lines wait until the story can carry them without wobbling.",
    },
  ];

  const toneRows = distributionRows(analystResult?.tone_distribution);
  const roleRows = distributionRows(analystResult?.role_distribution);
  const storyTargetRows = distributionRows(analystResult?.story_target_distribution, 3);
  const waitingRows: Array<[string, number]> = [["waiting", 0]];

  return (
    <>
      <PublicHeader data={siteData} />
      <main className="shell home-shell redesigned-home">
        <section className="hero-board live-desk-hero">
          <article className="home-hero-primary">
            <div className="hero-edition-line">
              <span>{editionLabel}</span>
              <span>{latestCycle?.status ? `Cycle ${latestCycle.status}` : "Cycle warming"}</span>
            </div>
            <h1>Anti-Trump politics, reported with a long memory.</h1>
            <p className="hero-dek">{heroLine}</p>
            <p className="hero-note">
              Reporting, analysis, and essays on the decisions shaping the present.
            </p>
            <div className="hero-actions">
              <Link href={leadHref} className="button-link">
                Read the latest
              </Link>
              <Link href="/workflow" className="button-link muted">
                Open notebook
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

        <section className="data-strip homepage-stats" aria-label="Live site data">
          {dataCards.map((card) => (
            <article key={card.label} className="data-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.copy}</p>
            </article>
          ))}
        </section>

        <section className="cycle-pulse homepage-process" aria-label="Live cycle pulse">
          <div className="section-heading section-heading-wide">
            <p className="section-kicker">Cycle pulse</p>
            <h2>Tonight's desk has a pulse.</h2>
            <p>
              The rhythm is simple: read widely, sort hard, write sharply, and only pass along what can stand under its
              own receipts.
            </p>
          </div>
          <div className="cycle-pulse-grid">
            {pulseCards.map((card) => (
              <article key={card.label} className={`cycle-card ${card.status}`}>
                <span>{card.label}</span>
                <strong>{card.metric}</strong>
                <p>{card.detail}</p>
                <em>{card.status}</em>
              </article>
            ))}
          </div>
        </section>

        <section className="research-workbench homepage-process">
          <div className="research-workbench-copy">
            <p className="section-kicker">Research lanes</p>
            <h2>The front page starts where the receipts start.</h2>
            <p>
              Before a line gets lipstick, it gets evidence. These are the angles still tugging at the sleeve because
              Trump-world keeps leaving the same fingerprints.
            </p>
          </div>

          <div className="research-lane-grid">
            {researchLaneItems.map((item, index) => (
              <article key={`${item.slug ?? "query"}-${item.query_hint ?? item.angle ?? index}`} className="research-lane-card">
                <span>{cleanCopy(item.theme) || humanizeSlug(item.slug) || `Lane ${index + 1}`}</span>
                <strong>{cleanCopy(item.angle || item.query_hint) || "Angle warming"}</strong>
                <p>{cleanCopy(item.query_hint) || "I keep this lane open while the receipts develop."}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="analysis-radar homepage-process">
          <article className="radar-panel">
            <div className="section-heading">
              <p className="section-kicker">Analysis radar</p>
              <h2>From pile to pattern.</h2>
              <p>The narrowing work is where the attitude earns its keep: tone, source role, story target, then the line.</p>
            </div>
            <div className="radar-grid">
              <div>
                <span>Tone distribution</span>
                {(toneRows.length ? toneRows : waitingRows).map(([label, value]) => (
                  <p key={label}>
                    <strong>{humanizeSlug(label)}</strong>
                    <em>{value}</em>
                  </p>
                ))}
              </div>
              <div>
                <span>Source roles</span>
                {(roleRows.length ? roleRows : waitingRows).map(([label, value]) => (
                  <p key={label}>
                    <strong>{humanizeSlug(label)}</strong>
                    <em>{value}</em>
                  </p>
                ))}
              </div>
              <div>
                <span>Story targets</span>
                {(storyTargetRows.length ? storyTargetRows : waitingRows).map(([label, value]) => (
                  <p key={label}>
                    <strong>{humanizeSlug(label)}</strong>
                    <em>{value}</em>
                  </p>
                ))}
              </div>
            </div>
          </article>

          <aside className="source-ledger">
            <div className="section-heading">
              <p className="section-kicker">Source ledger</p>
              <h2>Receipts stay near the writing.</h2>
              <p>No perfume without paper.</p>
            </div>
            <div className="ledger-list">
              {receiptLinks.length ? (
                receiptLinks.map((link) => (
                  <a key={`${link.url}-${link.title}`} href={link.url ?? "#"} target="_blank" rel="noreferrer">
                    <strong>{cleanCopy(link.title) || "Untitled reporting pick"}</strong>
                    <span>
                      {cleanCopy(link.source_name) || "source"}
                      {link.credibility_tier ? ` / ${link.credibility_tier}` : ""}
                      {link.quality_score ? ` / ${link.quality_score.toFixed(1)}` : ""}
                    </span>
                  </a>
                ))
              ) : (
                <p className="stack-empty">New receipts will land here when they are worth keeping open.</p>
              )}
            </div>
          </aside>
        </section>

        <section className="writing-queue homepage-writing">
          <div className="section-heading section-heading-wide">
            <p className="section-kicker">Writing queue</p>
            <h2>What is sharp enough to survive the draft.</h2>
            <p>The next pieces sit here until they have more than heat: they need a reason, a target, and a sentence worth carrying.</p>
          </div>
          <div className="queue-grid">
            {writingQueue.length ? (
              writingQueue.map((story) => (
                <Link key={story.key} href={story.href} className="queue-card">
                  <span>{story.status}</span>
                  <strong>{story.title}</strong>
                  <p>{story.detail}</p>
                </Link>
              ))
            ) : (
              <article className="queue-card static">
                <span>Queue warming</span>
                <strong>The next draft has to earn the space.</strong>
                <p>I would rather leave the shelf quiet than dress up a weak argument.</p>
              </article>
            )}
          </div>
        </section>

        <section className="blog-and-heat homepage-content">
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
                <p className="stack-empty">The next post will land here when it has earned the front page.</p>
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

        <section className="channel-showcase homepage-process">
          <div className="section-heading section-heading-wide">
            <p className="section-kicker">Channels</p>
            <h2>The beats that keep proving themselves.</h2>
            <p>These are the Trump-world habits I refuse to let vanish into daily churn.</p>
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
                <p>Once the pattern is clear enough, I will give it a proper name.</p>
              </article>
            )}
          </div>
        </section>

        <section className="reading-room-grid homepage-process">
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
              <p className="section-kicker">Line shelf</p>
              <h2>Fast lines with receipts behind them</h2>
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
                <p className="stack-empty">The fastest lines collect here once the latest cycle has something worth keeping.</p>
              )}
            </div>
          </article>
        </section>

        <section className="home-closing-note homepage-footer-note">
          <p>
            A running editorial desk for the stories and patterns that deserve another look.
          </p>
          <p className="closing-signoff">Read the archive, or follow the work as it develops.</p>
          <div className="hero-actions">
            <Link href="/archive" className="button-link">
              Read the archive
            </Link>
            <Link href="/workflow" className="button-link muted">
              Open the notebook
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
