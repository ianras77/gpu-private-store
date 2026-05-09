import Link from "next/link";

import { AdminQuickActions } from "@/components/AdminQuickActions";
import { apiGet, safeDate, safeRelativeDate } from "@/lib/api";

type MissionControl = {
  controls: {
    direct_publish: boolean;
    x_live_posting: boolean;
    x_research_enabled: boolean;
  };
  summary: {
    sources: number;
    themes: number;
    analysis_briefs: number;
    editorial_drafts: number;
    homepage_drafts: number;
    social_drafts: number;
    pipeline_cycles: number;
  };
  quality: {
    quality_buckets: { high: number; medium: number; low: number };
  };
  analysis: {
    analysis_headline?: string;
    pattern_read?: string;
    tone_lane?: string | { name?: string };
    topic_tone_map?: Array<{ topic?: string; tone?: string; story_target?: string }>;
  };
  publish_readiness: {
    ready: boolean;
    flags: string[];
    manual_review: boolean;
    latest_cycle_completed_at?: string;
    latest_source_at?: string;
  };
  pipeline: {
    cycle_interval_minutes: number;
    roles: Array<{ role: string; title: string; description: string; plugins: string[]; outputs?: string[] }>;
    latest_cycle: {
      cycle_id: string;
      status: string;
      completed_at?: string;
      stages: Array<{ stage: string; event: string; at: string; error?: string }>;
      result?: Record<string, unknown>;
    } | null;
  };
  latest_editorial: Array<{
    id: string;
    title?: string;
    slug?: string;
    status: string;
    object_type: string;
    why_now?: string;
    publish_recommendation?: { recommended?: boolean; style_score?: number };
  }>;
  recent_social: Array<{
    id: string;
    body: string;
    variant?: string;
    hook_type?: string;
    slot?: string;
    status: string;
    published_at?: string;
  }>;
  top_themes: Array<{ slug: string; name: string; active_score: number; description?: string }>;
  strong_links: Array<{ id: string; title?: string; source_name?: string; source_url: string; quality_score: number }>;
  recent_sources: Array<{
    id: string;
    title?: string;
    source_name?: string;
    source_url: string;
    fetched_at?: string;
    published_at?: string;
    quality_score: number;
    credibility_tier?: string;
    current_news_eligible?: boolean;
  }>;
};

async function getMissionControl() {
  try {
    return await apiGet<MissionControl>("/api/v1/admin/mission-control");
  } catch {
    return null;
  }
}

function humanizeFlag(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function AdminPage() {
  const mission = await getMissionControl();

  if (!mission) {
    return (
      <>
        <h1>Mission Control</h1>
        <p>The mission feed is unavailable right now.</p>
      </>
    );
  }

  const readiness = mission.publish_readiness;
  const latestCycle = mission.pipeline.latest_cycle;
  const quality = mission.quality.quality_buckets;
  const readinessFlags = readiness.flags ?? [];
  const liveSources = mission.recent_sources.slice(0, 4);

  return (
    <>
      <section className="admin-hero">
        <div>
          <p className="admin-kicker">Mission</p>
          <h1>Agentic newsroom cockpit</h1>
          <p className="admin-copy">
            This is the live operator view of the desk: research freshness, publishing readiness, strong links, social package pressure,
            and the latest cycle’s actual choices. You should be able to run the room from here, not just admire the dashboard.
          </p>
        </div>
        <div className="admin-status-grid">
          <article className="mission-stat">
            <span>Readiness</span>
            <strong>{readiness.ready ? "ready to ship" : "assembling next package"}</strong>
            <p>{readiness.latest_cycle_completed_at ? `Latest cycle ${safeRelativeDate(readiness.latest_cycle_completed_at)}.` : "No completed cycle yet."}</p>
          </article>
          <article className="mission-stat">
            <span>Source freshness</span>
            <strong>{readiness.latest_source_at ? safeRelativeDate(readiness.latest_source_at) : "unknown"}</strong>
            <p>{readiness.latest_source_at ? safeDate(readiness.latest_source_at) : "Awaiting new research."}</p>
          </article>
          <article className="mission-stat">
            <span>Runtime mode</span>
            <strong>{mission.controls.direct_publish ? "publish-first" : "draft-first"}</strong>
            <p>{mission.controls.x_live_posting ? "live social enabled" : "social dispatch dry-run or manual"}</p>
          </article>
        </div>
      </section>

      <section className="mission-grid">
        <AdminQuickActions />

        <article className="story-panel">
          <p className="section-kicker">Publish gate</p>
          <h3>{readiness.ready ? "Green enough to package" : "Hold and sharpen"}</h3>
          <p>This is the fast read on whether the next drop can move or still needs another pass through the desk.</p>
          <div className="stack-list compact">
            <div className="stack-item static">
              <strong>Manual review</strong>
              <span>{readiness.manual_review ? "On. A human still signs off before anything goes live." : "Off. The desk can ship as soon as the gates clear."}</span>
            </div>
            {readinessFlags.length ? (
              readinessFlags.map((flag) => (
                <div key={flag} className="stack-item static">
                  <strong>{humanizeFlag(flag)}</strong>
                  <span>Resolve this flag before treating the package like a front-page lock.</span>
                </div>
              ))
            ) : (
              <div className="stack-item static">
                <strong>No active blockers</strong>
                <span>The current package is clear of extra publish flags.</span>
              </div>
            )}
            <div className="stack-item static">
              <strong>Research pulse</strong>
              <span>{mission.controls.x_research_enabled ? "Web plus X is active for contradiction checks and live context." : "Web-only research is active right now."}</span>
            </div>
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Analysis pulse</p>
          <h3>{mission.analysis.analysis_headline ?? "Intelligence layer warming up"}</h3>
          <p>
            {mission.analysis.pattern_read ??
              "The analyst stage will turn the research stack into a tone lane, contradiction read, and topic map as soon as the next cycle lands."}
          </p>
          <div className="stack-list compact">
            <div className="stack-item static">
              <strong>Tone lane</strong>
              <span>
                {typeof mission.analysis.tone_lane === "string"
                  ? mission.analysis.tone_lane
                  : mission.analysis.tone_lane?.name || "Not assigned yet"}
              </span>
            </div>
            {(mission.analysis.topic_tone_map ?? []).slice(0, 2).map((item, index) => (
              <div key={`${item.topic}-${index}`} className="stack-item static">
                <strong>{item.topic || "Current topic"}</strong>
                <span>{item.tone || "Tone pending"}</span>
                <span>{item.story_target || "Target pending"}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mission-grid">
        <article className="story-panel">
          <p className="section-kicker">Pressure board</p>
          <div className="metric-grid">
            <div className="metric-card">
              <span>Sources</span>
              <strong>{mission.summary.sources}</strong>
            </div>
            <div className="metric-card">
              <span>Themes</span>
              <strong>{mission.summary.themes}</strong>
            </div>
            <div className="metric-card">
              <span>Analysis briefs</span>
              <strong>{mission.summary.analysis_briefs}</strong>
            </div>
            <div className="metric-card">
              <span>Editorial drafts</span>
              <strong>{mission.summary.editorial_drafts}</strong>
            </div>
            <div className="metric-card">
              <span>Social drafts</span>
              <strong>{mission.summary.social_drafts}</strong>
            </div>
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Quality mix</p>
          <div className="metric-grid">
            <div className="metric-card">
              <span>High</span>
              <strong>{quality.high}</strong>
            </div>
            <div className="metric-card">
              <span>Medium</span>
              <strong>{quality.medium}</strong>
            </div>
            <div className="metric-card">
              <span>Low</span>
              <strong>{quality.low}</strong>
            </div>
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Live radar</p>
          <h3>What just entered the room</h3>
          <div className="stack-list compact">
            {liveSources.length ? (
              liveSources.map((source) => (
                <div key={source.id} className="stack-item static">
                  <strong>{source.title || "Untitled source"}</strong>
                  <span>
                    {(source.source_name || "news desk").trim()} · quality {source.quality_score.toFixed(1)} ·{" "}
                    {source.current_news_eligible ? "live-ready" : "needs a stronger current-news read"}
                  </span>
                  <span>
                    {source.published_at
                      ? safeDate(source.published_at)
                      : source.fetched_at
                        ? `Fetched ${safeRelativeDate(source.fetched_at)}`
                        : "Freshness unknown"}
                  </span>
                </div>
              ))
            ) : (
              <p className="stack-empty">Fresh sources will show up here as soon as the next sweep lands.</p>
            )}
          </div>
        </article>
      </section>

      <section className="mission-grid">
        <article className="story-panel">
          <p className="section-kicker">Operator paths</p>
          <h3>Open the next tool without hunting</h3>
          <p>These are the fastest follow-up moves once you know whether the desk needs new research, packaging, or a front-page check.</p>
          <div className="quick-actions-grid">
            <Link href="/admin/settings" className="button-link muted small">
              Tune settings
            </Link>
            <Link href="/admin/inbox" className="button-link muted small">
              Inspect inbox
            </Link>
            <Link href="/admin/trends" className="button-link muted small">
              Inspect trends
            </Link>
            <Link href="/admin/social" className="button-link muted small">
              Package social
            </Link>
            <Link href="/archive" className="button-link muted small">
              Review archive
            </Link>
            <Link href="/" className="button-link muted small">
              See front page
            </Link>
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Latest cycle</p>
          <h3>{latestCycle ? latestCycle.status : "No cycle yet"}</h3>
          <p>
            Every {mission.pipeline.cycle_interval_minutes} minutes the desk moves through research, writing, and packaging. The latest
            cycle is shown below exactly as it landed.
          </p>
          <div className="stack-list compact">
            {latestCycle?.stages?.length ? (
              latestCycle.stages.map((stage) => (
                <div key={`${stage.stage}-${stage.event}-${stage.at}`} className="stack-item static">
                  <strong>
                    {stage.stage} · {stage.event}
                  </strong>
                  <span>
                    {safeDate(stage.at)}
                    {stage.error ? ` · ${stage.error}` : ""}
                  </span>
                </div>
              ))
            ) : (
              <p className="stack-empty">Run a cycle from Settings to populate the telemetry board.</p>
            )}
          </div>
        </article>

        <article className="story-panel panel-span-2">
          <p className="section-kicker">Role contract</p>
          <div className="stack-list compact">
            {mission.pipeline.roles.map((role) => (
              <div key={role.role} className="stack-item static">
                <strong>{role.title}</strong>
                <span>
                  {role.description}
                  {role.outputs?.length ? ` Outputs: ${role.outputs.join(", ")}.` : ""}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mission-grid">
        <article className="story-panel">
          <p className="section-kicker">Story slate</p>
          <div className="stack-list">
            {mission.latest_editorial.length ? (
              mission.latest_editorial.map((story) => {
                const content = (
                  <>
                    <strong>{story.title || "Untitled story"}</strong>
                    <span>
                      {story.object_type} · {story.status}
                      {story.publish_recommendation?.recommended ? " · publish recommend" : ""}
                      {story.publish_recommendation?.style_score ? ` · style ${story.publish_recommendation.style_score}` : ""}
                    </span>
                    <span>{story.why_now || "Awaiting launch-packet summary."}</span>
                  </>
                );

                return story.slug ? (
                  <Link key={story.id} href={`/story/${story.slug}`} className="stack-item">
                    {content}
                  </Link>
                ) : (
                  <div key={story.id} className="stack-item static">
                    {content}
                  </div>
                );
              })
            ) : (
              <p className="stack-empty">No editorial objects yet.</p>
            )}
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Social package</p>
          <div className="stack-list">
            {mission.recent_social.length ? (
              mission.recent_social.map((post) => (
                <div key={post.id} className="stack-item static">
                  <strong>{post.variant || post.hook_type || "asset"}</strong>
                  <span>{post.body}</span>
                  <span>
                    {post.status}
                    {post.published_at ? ` · ${safeRelativeDate(post.published_at)}` : ""}
                  </span>
                </div>
              ))
            ) : (
              <p className="stack-empty">The Queen package will land here after the next social generation pass.</p>
            )}
          </div>
        </article>
      </section>

      <section className="mission-grid">
        <article className="story-panel">
          <p className="section-kicker">Strong links</p>
          <div className="stack-list compact">
            {mission.strong_links.length ? (
              mission.strong_links.map((link) => (
                <a key={link.id} href={link.source_url} target="_blank" rel="noreferrer" className="stack-item">
                  <strong>{link.title || "Untitled link"}</strong>
                  <span>
                    {link.source_name || "news desk"} · quality {link.quality_score.toFixed(1)}
                  </span>
                </a>
              ))
            ) : (
              <p className="stack-empty">No links have cleared the wow-factor threshold yet.</p>
            )}
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Theme heat</p>
          <div className="stack-list compact">
            {mission.top_themes.length ? (
              mission.top_themes.map((theme) => (
                <div key={theme.slug} className="stack-item static">
                  <strong>{theme.name}</strong>
                  <span>
                    score {theme.active_score.toFixed(2)}
                    {theme.description ? ` · ${theme.description}` : ""}
                  </span>
                </div>
              ))
            ) : (
              <p className="stack-empty">The research layer has not clustered themes yet.</p>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
