import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicHeader } from "@/components/PublicHeader";
import { apiGet, safeDate } from "@/lib/api";
import { themeName, themeNarrative } from "@/lib/public-site";

type Theme = {
  slug: string;
  name: string;
  description?: string;
  active_score: number;
  last_seen_at?: string;
};

type EditorialMetadata = {
  theme_slug?: string;
  launch_packet?: {
    why_now?: string;
  };
  story_brief?: {
    theme_slug?: string;
    focus_label?: string;
  };
};

type Editorial = {
  id: string;
  title: string;
  slug: string;
  object_type: string;
  status: string;
  dek?: string;
  summary?: string;
  published_at?: string;
  created_at: string;
  metadata?: EditorialMetadata;
};

function scrubLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function matchesTheme(story: Editorial, theme: Theme): boolean {
  return story.metadata?.theme_slug === theme.slug || story.metadata?.story_brief?.theme_slug === theme.slug;
}

function heatWidth(score: number): string {
  return `${Math.max(16, Math.min(100, Math.round(score * 14)))}%`;
}

async function getTheme(slug: string) {
  try {
    const themes = await apiGet<Theme[]>("/api/v1/themes");
    const theme = themes.find((t) => t.slug === slug);
    if (!theme) {
      return null;
    }
    const stories = await apiGet<Editorial[]>("/api/v1/editorial/objects?limit=120");
    return { theme, stories };
  } catch {
    return null;
  }
}

export default async function ThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getTheme(slug);
  if (!data) {
    notFound();
  }

  const publishedStories = data.stories.filter((story) => story.status === "published");
  const matchingStories = publishedStories.filter((story) => matchesTheme(story, data.theme));
  const storyShelf = matchingStories.slice(0, 6);

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="page-hero">
          <p className="hero-kicker">Lane</p>
          <h1>{themeName(data.theme)}</h1>
          <p className="hero-note">{themeNarrative(data.theme)}</p>
          <div className="hero-actions">
            <Link href="/themes" className="button-link muted small">
              Back to all lanes
            </Link>
            <Link href="/archive" className="button-link muted small">
              Open the archive
            </Link>
          </div>
          <ul className="signal-chip-list">
            <li>Heat {(data.theme.active_score ?? 0).toFixed(2)}</li>
            {data.theme.last_seen_at ? <li>Seen {safeDate(data.theme.last_seen_at)}</li> : null}
            <li>Trump-world watch</li>
          </ul>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">Why I keep watching</p>
            <h3>This lane usually reveals the bigger lie beneath the headline.</h3>
            <p>
              {themeNarrative(data.theme)} That is why I keep a lane page for it instead of letting it vanish back into a single day&apos;s
              post.
            </p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Heat meter</p>
            <div className="heat-list">
              <div className="heat-row static">
                <div className="heat-copy">
                  <strong>{themeName(data.theme)}</strong>
                  <span>{themeNarrative(data.theme)}</span>
                </div>
                <div className="heat-meter" aria-hidden="true">
                  <div className="heat-bar" style={{ width: heatWidth(data.theme.active_score ?? 0) }} />
                </div>
                <span className="signal-rank">{(data.theme.active_score ?? 0).toFixed(2)}</span>
              </div>
            </div>
          </article>
        </section>

        <section className="column-band">
          {storyShelf.length ? (
            storyShelf.map((story) => (
              <article key={story.id} className="story-panel">
                <p className="section-kicker">Live story</p>
                <h3>
                  <Link href={`/story/${story.slug}`}>{scrubLabel(story.title)}</Link>
                </h3>
                <p>
                  {scrubLabel(
                    story.metadata?.launch_packet?.why_now ||
                      story.summary ||
                      story.dek ||
                      "This BAT lane is still heating up and collecting sharper angles.",
                  )}
                </p>
              </article>
            ))
          ) : (
            <article className="story-panel panel-span-2">
              <p className="section-kicker">No filed stories yet</p>
              <h3>This lane is live on the board before it is fully filed on the shelf.</h3>
              <p>
                I do not want this page pretending unrelated posts belong here. Once a story is explicitly filed into this lane, it will
                show up here with the rest of the pattern.
              </p>
            </article>
          )}
        </section>
      </main>
    </>
  );
}
