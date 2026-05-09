import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicHeader } from "@/components/PublicHeader";
import { apiGet, safeDate } from "@/lib/api";
import { getPublicSiteData, themeName, themeNarrative } from "@/lib/public-site";

type StoryMetadata = {
  theme_slug?: string;
  contradiction_map?: Array<{
    title?: string;
    outlet?: string;
    quality_score?: number;
    credibility_tier?: string;
    age_days?: number;
  }>;
  launch_packet?: {
    why_now?: string;
    pull_quote?: string;
    quote_card_line?: string;
    pattern_signals?: string[];
    social_hooks?: string[];
    headline_variants?: string[];
  };
  story_brief?: {
    story_mode?: string;
    focus_label?: string;
    theme_slug?: string;
    audience_hook?: string;
    freshest_evidence?: string;
    source_mix?: {
      count?: number;
      high_credibility_count?: number;
      avg_quality?: number;
      freshest_age_days?: number | null;
      top_outlets?: string[];
    };
    contradiction_map?: Array<{
      title?: string;
      outlet?: string;
      quality_score?: number;
      credibility_tier?: string;
      age_days?: number;
    }>;
  };
  retrieval_bundle?: {
    raw_sources?: Array<{
      id?: string;
      title?: string;
      url?: string;
      source_name?: string;
      source_label?: string;
      quality_score?: number;
      credibility_tier?: string;
      age_days?: number;
      published_at?: string;
      evidence_excerpts?: string[];
    }>;
  };
  poster_package?: {
    eyebrow?: string;
    share_title?: string;
    share_dek?: string;
    quote_card_line?: string;
    screenshot_lines?: string[];
    group_chat_caption?: string;
  };
  social_package?: {
    dispatch?: string;
    quote_card?: string;
    thread?: string[];
  };
  publish_recommendation?: {
    reason?: string;
    grounded_source_count?: number;
    freshness_age_days?: number | null;
    style_score?: number;
    recommended?: boolean;
  };
};

type StoryBrief = NonNullable<StoryMetadata["story_brief"]>;
type SourceMix = NonNullable<StoryBrief["source_mix"]>;

type Editorial = {
  id: string;
  title: string;
  slug: string;
  object_type?: string;
  dek?: string;
  body_md?: string;
  summary?: string;
  status: string;
  created_at: string;
  published_at?: string;
  metadata?: StoryMetadata;
};

type StoryBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] };

function cleanLine(text: string): string {
  return text
    .replace(/[*_`]/g, "")
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toStoryBlocks(body?: string): StoryBlock[] {
  if (!body) {
    return [{ type: "paragraph", text: "Draft body unavailable." }];
  }

  const rawLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "---");

  const blocks: StoryBlock[] = [];
  let activeList: string[] = [];

  const flushList = () => {
    if (activeList.length) {
      blocks.push({ type: "list", items: activeList });
      activeList = [];
    }
  };

  for (const raw of rawLines) {
    if (/^[-*]\s+/.test(raw)) {
      activeList.push(cleanLine(raw.replace(/^[-*]\s+/, "")));
      continue;
    }

    const heading = raw.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      flushList();
      blocks.push({ type: "heading", text: cleanLine(heading[1]) });
      continue;
    }

    const labeled = raw.match(/^\*{0,2}\s*(headline|dek|summary|paragraph\s*\d+|pattern signals?)\s*\*{0,2}\s*:\s*(.*)$/i);
    if (labeled) {
      flushList();
      const value = cleanLine(labeled[2]);
      if (!value) {
        continue;
      }
      blocks.push({ type: "paragraph", text: value });
      continue;
    }

    flushList();
    blocks.push({ type: "paragraph", text: cleanLine(raw.replace(/^>\s*/, "")) });
  }

  flushList();
  return blocks;
}

function storyModeLabel(storyBrief?: StoryBrief, objectType?: string): string {
  const raw = cleanLine(storyBrief?.story_mode || storyBrief?.focus_label || objectType || "");
  if (!raw) {
    return "BAT Dispatch";
  }
  return raw.replace(/_/g, " ");
}

function reportingLine(sourceMix?: SourceMix): string {
  const count = sourceMix?.count ?? 0;
  const outlets = (sourceMix?.top_outlets ?? []).filter(Boolean).slice(0, 3).map(cleanLine);

  if (!count) {
    return "I keep the reporting trail here once the source deck is ready.";
  }

  if (outlets.length) {
    return `${count} linked sources, led by ${outlets.join(", ")}.`;
  }

  return `${count} linked sources behind this story.`;
}

async function getStory(slug: string) {
  try {
    return await apiGet<Editorial>(`/api/v1/editorial/objects/by-slug/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [story, publicSiteData] = await Promise.all([getStory(slug), getPublicSiteData()]);
  if (!story) {
    notFound();
  }

  const blocks = toStoryBlocks(story.body_md);
  const metadata = story.metadata ?? {};
  const launchPacket = metadata.launch_packet ?? {};
  const storyBrief = metadata.story_brief ?? {};
  const sourceMix = storyBrief.source_mix ?? {};
  const sources = metadata.retrieval_bundle?.raw_sources ?? [];
  const contradictionMap = metadata.contradiction_map ?? storyBrief.contradiction_map ?? [];
  const posterPackage = metadata.poster_package ?? {};
  const socialPackage = metadata.social_package ?? {};
  const publishRecommendation = metadata.publish_recommendation ?? {};
  const whyNow =
    cleanLine(launchPacket.why_now || storyBrief.audience_hook || story.summary || "I pulled this forward because the contradiction is still live.");
  const publicationLine = story.published_at ? `Published ${safeDate(story.published_at)}` : `Filed ${safeDate(story.created_at)}`;
  const themeSlug = metadata.theme_slug || storyBrief.theme_slug;
  const relatedTheme = publicSiteData.activeThemes.find((theme) => theme.slug === themeSlug) ?? null;
  const visibleSocialHooks = (launchPacket.social_hooks ?? []).slice(0, 2);
  const pocketLines = (posterPackage.screenshot_lines ?? []).slice(0, 3);
  const groundedSourceCount = publishRecommendation.grounded_source_count ?? sourceMix.count ?? sources.length;
  const freshnessAgeDays = publishRecommendation.freshness_age_days ?? sourceMix.freshest_age_days;
  const relatedStories = publicSiteData.publishedStories
    .filter((item) => item.slug !== story.slug)
    .filter((item) => {
      if (!themeSlug) {
        return true;
      }
      const itemThemeSlug = item.metadata?.theme_slug || item.metadata?.story_brief?.theme_slug;
      return itemThemeSlug === themeSlug;
    })
    .slice(0, 3);

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="page-hero">
          <p className="hero-kicker">{storyModeLabel(storyBrief, story.object_type)}</p>
          <h1>{cleanLine(story.title)}</h1>
          {story.dek ? <p className="story-dek">{cleanLine(story.dek)}</p> : null}
          <p className="story-meta">
            {publicationLine}
            {story.status !== "published" ? ` | ${cleanLine(story.status)}` : ""}
          </p>
          <div className="story-hero-links">
            {themeSlug ? (
              <Link href={`/themes/${themeSlug}`} className="button-link muted small">
                See this lane
              </Link>
            ) : null}
            <Link href="/archive" className="button-link muted small">
              More posts
            </Link>
          </div>
          {(launchPacket.pattern_signals ?? []).length ? (
            <ul className="signal-chip-list">
              {launchPacket.pattern_signals?.map((signal) => (
                <li key={signal}>{cleanLine(signal)}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="story-shell">
          <article className="editorial-copy story-main">
            {launchPacket.pull_quote ? <blockquote className="story-quote">“{cleanLine(launchPacket.pull_quote)}”</blockquote> : null}
            {blocks.map((block, index) => {
              if (block.type === "heading") {
                return <h2 key={`${block.type}-${index}`}>{block.text}</h2>;
              }
              if (block.type === "list") {
                return (
                  <ul key={`${block.type}-${index}`} className="story-list">
                    {block.items.map((item, itemIndex) => (
                      <li key={`${index}-${itemIndex}`}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return <p key={`${block.type}-${index}`}>{block.text}</p>;
            })}
          </article>

          <aside className="story-sidebar">
            <div className="story-panel">
              <p className="section-kicker">Why I pulled it forward</p>
              <div className="stack-list compact">
                <div className="stack-item static">
                  <strong>Why now</strong>
                  <span>{whyNow}</span>
                </div>
                {launchPacket.quote_card_line ? (
                  <div className="stack-item static">
                    <strong>Steal this line</strong>
                    <span>{cleanLine(launchPacket.quote_card_line)}</span>
                  </div>
                ) : null}
                {visibleSocialHooks.map((hook) => (
                  <div key={hook} className="stack-item static">
                    <strong>Bring to the chat</strong>
                    <span>{cleanLine(hook)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="story-panel">
              <p className="section-kicker">How this story was built</p>
              <div className="stack-list compact">
                <div className="stack-item static">
                  <strong>Reporting mix</strong>
                  <span>{reportingLine(sourceMix)}</span>
                </div>
                <div className="stack-item static">
                  <strong>Grounding floor</strong>
                  <span>{groundedSourceCount} source{groundedSourceCount === 1 ? "" : "s"} carried this post into the publish lane.</span>
                </div>
                {storyBrief.freshest_evidence ? (
                  <div className="stack-item static">
                    <strong>Freshest evidence</strong>
                    <span>{cleanLine(storyBrief.freshest_evidence)}</span>
                  </div>
                ) : null}
                {freshnessAgeDays !== undefined && freshnessAgeDays !== null ? (
                  <div className="stack-item static">
                    <strong>Freshness window</strong>
                    <span>{freshnessAgeDays} day{freshnessAgeDays === 1 ? "" : "s"} old at draft time.</span>
                  </div>
                ) : null}
                {publishRecommendation.reason ? (
                  <div className="stack-item static">
                    <strong>Editorial read</strong>
                    <span>{cleanLine(publishRecommendation.reason.replace(/_/g, " "))}</span>
                  </div>
                ) : null}
                {(sourceMix.top_outlets ?? []).slice(0, 3).map((outlet) => (
                  <div key={outlet} className="stack-item static">
                    <strong>Outlet on deck</strong>
                    <span>{cleanLine(outlet)}</span>
                  </div>
                ))}
                {contradictionMap.slice(0, 3).map((item) => (
                  <div key={`${item.outlet}-${item.title}`} className="stack-item static">
                    <strong>{cleanLine(item.outlet || "Receipt")}</strong>
                    <span>{cleanLine(item.title || "Untitled contradiction point")}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">Receipts on the desk</p>
            <div className="stack-list compact">
              {sources.length ? (
                sources.map((source) => (
                  <a key={`${source.id}-${source.url}`} href={source.url ?? "#"} target="_blank" rel="noreferrer" className="stack-item">
                    <strong>{cleanLine(source.title || "Untitled source")}</strong>
                    <span>
                      {cleanLine(source.source_label || source.source_name || "news desk")} | quality {(source.quality_score ?? 0).toFixed(1)}
                      {source.credibility_tier ? ` | ${cleanLine(source.credibility_tier)} credibility` : ""}
                      {source.published_at ? ` | ${safeDate(source.published_at)}` : ""}
                    </span>
                    {(source.evidence_excerpts ?? []).slice(0, 1).map((excerpt) => (
                      <span key={excerpt}>{cleanLine(excerpt)}</span>
                    ))}
                  </a>
                ))
              ) : (
                <p className="stack-empty">Linked receipts will appear here when this story&apos;s source deck is available.</p>
              )}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">How the line travels</p>
            <div className="stack-list compact">
              {posterPackage.share_title ? (
                <div className="stack-item static">
                  <strong>Headline to carry</strong>
                  <span>{cleanLine(posterPackage.share_title)}</span>
                </div>
              ) : null}
              {posterPackage.share_dek ? (
                <div className="stack-item static">
                  <strong>Caption</strong>
                  <span>{cleanLine(posterPackage.share_dek)}</span>
                </div>
              ) : null}
              {posterPackage.group_chat_caption ? (
                <div className="stack-item static">
                  <strong>Text this</strong>
                  <span>{cleanLine(posterPackage.group_chat_caption)}</span>
                </div>
              ) : null}
              {pocketLines.map((line, index) => (
                <div key={`${index}-${line}`} className="stack-item static">
                  <strong>Screenshot line {index + 1}</strong>
                  <span>{cleanLine(line)}</span>
                </div>
              ))}
              {socialPackage.dispatch ? (
                <div className="stack-item static">
                  <strong>Dispatch</strong>
                  <span>{cleanLine(socialPackage.dispatch)}</span>
                </div>
              ) : null}
              {socialPackage.quote_card ? (
                <div className="stack-item static">
                  <strong>Quote card</strong>
                  <span>{cleanLine(socialPackage.quote_card)}</span>
                </div>
              ) : null}
              {(socialPackage.thread ?? []).map((line, index) => (
                <div key={`${index}-${line}`} className="stack-item static">
                  <strong>Thread {index + 1}</strong>
                  <span>{cleanLine(line)}</span>
                </div>
              ))}
              {!socialPackage.dispatch && !socialPackage.quote_card && !(socialPackage.thread ?? []).length ? (
                <p className="stack-empty">Share lines land here once this story is ready to leave the page and start traveling.</p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="column-band story-aftercare">
          <article className="story-panel">
            <p className="section-kicker">Keep wandering</p>
            <h3>Three places I would send you next</h3>
            <div className="stack-list compact">
              {relatedStories.length ? (
                relatedStories.map((item) => (
                  <Link key={item.id} href={`/story/${item.slug}`} className="stack-item">
                    <strong>{cleanLine(item.title)}</strong>
                    <span>{cleanLine(item.summary || item.dek || item.metadata?.launch_packet?.why_now || "Another nearby piece from the same room.")}</span>
                  </Link>
                ))
              ) : (
                <>
                  <Link href="/archive" className="stack-item">
                    <strong>Open the archive</strong>
                    <span>The shelf is the fastest way to see how this story sits beside the others.</span>
                  </Link>
                  <Link href="/themes" className="stack-item">
                    <strong>Browse the lanes</strong>
                    <span>The lane pages are where the bigger pattern starts showing its shape.</span>
                  </Link>
                  <Link href="/workflow" className="stack-item">
                    <strong>Open the notebook</strong>
                    <span>The public notebook keeps the searches, opportunities, and near-misses visible.</span>
                  </Link>
                </>
              )}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Why this one stayed on my desk</p>
            <h3>{relatedTheme ? themeName(relatedTheme) : "A story I was not ready to let go of yet"}</h3>
            <p>
              {relatedTheme
                ? themeNarrative(relatedTheme)
                : "Some stories stay because they clarify the whole week, not just the hour. This one earned its spot by making the larger pattern easier to name."}
            </p>
            <p>
              {themeSlug
                ? "If you want the recurring logic around this post, the lane page is the right next stop."
                : "If you want the broader context, the archive and notebook will show you how this piece fits into the rest of the room."}
            </p>
            <div className="hero-actions">
              {themeSlug ? (
                <Link href={`/themes/${themeSlug}`} className="button-link muted small">
                  Open this lane
                </Link>
              ) : null}
              <Link href="/archive" className="button-link muted small">
                Back to the shelf
              </Link>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
