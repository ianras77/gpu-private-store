import { AnalysisRefreshButton } from "@/components/AnalysisRefreshButton";
import { apiGet, safeDate } from "@/lib/api";

type AnalysisBrief = {
  id?: string;
  label?: string;
  title?: string;
  summary?: string;
  confidence?: number;
  source_count?: number;
  updated_at?: string;
  meta?: {
    tone?: {
      primary?: string;
      long_form?: string;
      short_form?: string;
      continuity?: string;
    };
    story_targets?: {
      long_form_label?: string;
      short_form?: string;
    };
    source_roles?: Array<{
      role?: string;
      role_label?: string;
      outlet?: string;
      title?: string;
      tone_fit?: string;
    }>;
    pattern_signals?: string[];
    open_loops?: string[];
    why_now?: string;
    focus_label?: string;
    selected_angle?: string;
  };
};

type AnalysisDashboard = {
  latest_analyst?: {
    analysis_headline?: string;
    pattern_read?: string;
    tone_lane?: string;
    topic_tone_map?: Array<{
      topic?: string;
      tone?: string;
      story_target?: string;
    }>;
  };
  site_brief?: AnalysisBrief | null;
  theme_briefs?: AnalysisBrief[];
  stats?: {
    brief_count?: number;
    tone_distribution?: Record<string, number>;
    topic_distribution?: Record<string, number>;
    role_distribution?: Record<string, number>;
  };
};

async function getAnalysisDashboard() {
  try {
    return await apiGet<AnalysisDashboard>("/api/v1/analysis");
  } catch {
    return null;
  }
}

function titleCase(value?: string | null) {
  if (!value) {
    return "";
  }
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function distributionTop(distribution?: Record<string, number>) {
  if (!distribution) {
    return null;
  }
  const [entry] = Object.entries(distribution).sort((left, right) => right[1] - left[1]);
  if (!entry) {
    return null;
  }
  return { label: titleCase(entry[0]), count: entry[1] };
}

export default async function AdminAnalysisPage() {
  const dashboard = await getAnalysisDashboard();

  if (!dashboard) {
    return (
      <>
        <h1>Analysis</h1>
        <p>The analysis board is unavailable right now.</p>
      </>
    );
  }

  const siteBrief = dashboard.site_brief;
  const themeBriefs = dashboard.theme_briefs ?? [];
  const toneTop = distributionTop(dashboard.stats?.tone_distribution);
  const roleTop = distributionTop(dashboard.stats?.role_distribution);
  const topicTop = distributionTop(dashboard.stats?.topic_distribution);
  const latest = dashboard.latest_analyst;

  return (
    <>
      <section className="admin-hero">
        <div>
          <p className="admin-kicker">Analysis</p>
          <h1>Intelligence layer</h1>
          <p className="admin-copy">
            This is the reasoning pass between research and writing: tone lane, contradiction pattern, link roles, and the next move each topic
            wants from the desk.
          </p>
          <div className="hero-actions">
            <AnalysisRefreshButton label="Refresh analysis now" runningLabel="Refreshing analysis..." />
          </div>
        </div>
        <div className="admin-status-grid">
          <article className="mission-stat">
            <span>Lead read</span>
            <strong>{latest?.analysis_headline ?? "Analysis board live"}</strong>
            <p>{latest?.pattern_read ?? "The next refresh will repopulate the site-wide read."}</p>
          </article>
          <article className="mission-stat">
            <span>Top tone</span>
            <strong>{toneTop?.label ?? "Unknown"}</strong>
            <p>{toneTop ? `${toneTop.count} active brief${toneTop.count === 1 ? "" : "s"}.` : "Waiting for active briefs."}</p>
          </article>
          <article className="mission-stat">
            <span>Top topic</span>
            <strong>{topicTop?.label ?? "Unknown"}</strong>
            <p>{roleTop ? `Most common link role: ${roleTop.label}.` : "No role mix yet."}</p>
          </article>
        </div>
      </section>

      <section className="mission-grid">
        <article className="story-panel">
          <p className="section-kicker">Site brief</p>
          <h3>{siteBrief?.title ?? siteBrief?.label ?? "No site brief yet"}</h3>
          <p>{siteBrief?.summary ?? "Run the analyst stage to populate the site-wide brief."}</p>
          <div className="stack-list compact">
            <div className="stack-item static">
              <strong>Focus</strong>
              <span>{siteBrief?.meta?.focus_label ?? "Current notebook"}</span>
            </div>
            <div className="stack-item static">
              <strong>Why now</strong>
              <span>{siteBrief?.meta?.why_now ?? "Waiting for the next refresh."}</span>
            </div>
            <div className="stack-item static">
              <strong>Tone lane</strong>
              <span>{titleCase(siteBrief?.meta?.tone?.primary) || latest?.tone_lane || "Unassigned"}</span>
            </div>
            <div className="stack-item static">
              <strong>Story target</strong>
              <span>
                {siteBrief?.meta?.story_targets?.long_form_label ?? "Long form open"} /{" "}
                {titleCase(siteBrief?.meta?.story_targets?.short_form) || "Short form"}
              </span>
            </div>
            <div className="stack-item static">
              <strong>Updated</strong>
              <span>{siteBrief?.updated_at ? safeDate(siteBrief.updated_at) : "Unknown"}</span>
            </div>
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Topic and tone map</p>
          <h3>How the desk should sound by lane</h3>
          <div className="stack-list compact">
            {(latest?.topic_tone_map ?? []).length ? (
              (latest?.topic_tone_map ?? []).map((item) => (
                <div key={`${item.topic}-${item.tone}`} className="stack-item static">
                  <strong>{item.topic ?? "Current topic"}</strong>
                  <span>{item.tone ?? "Tone pending"}</span>
                  <span>{item.story_target ?? "Story target pending"}</span>
                </div>
              ))
            ) : (
              <p className="stack-empty">The next analysis refresh will assign topic/tone pairs here.</p>
            )}
          </div>
        </article>
      </section>

      <section className="mission-grid">
        <article className="story-panel">
          <p className="section-kicker">Signal roles</p>
          <h3>What the links are doing for the writing</h3>
          <div className="stack-list compact">
            {(siteBrief?.meta?.source_roles ?? []).length ? (
              (siteBrief?.meta?.source_roles ?? []).slice(0, 4).map((role, index) => (
                <div key={`${role.outlet}-${index}`} className="stack-item static">
                  <strong>{role.role_label ?? titleCase(role.role) ?? "Link role"}</strong>
                  <span>{role.outlet ?? "news desk"}</span>
                  <span>{role.title ?? role.tone_fit ?? "Use this source to sharpen the read."}</span>
                </div>
              ))
            ) : (
              <p className="stack-empty">Link roles will appear here when the analyst refreshes the active brief.</p>
            )}
          </div>
        </article>

        <article className="story-panel">
          <p className="section-kicker">Open loops</p>
          <h3>What still needs a sharper pass</h3>
          <div className="stack-list compact">
            {(siteBrief?.meta?.open_loops ?? []).length ? (
              (siteBrief?.meta?.open_loops ?? []).map((loop) => (
                <div key={loop} className="stack-item static">
                  <strong>Keep watching</strong>
                  <span>{loop}</span>
                </div>
              ))
            ) : (
              <p className="stack-empty">The next brief will leave fresh open loops here.</p>
            )}
          </div>
        </article>
      </section>

      <section className="story-panel">
        <p className="section-kicker">Theme cards</p>
        <h3>How the hot lanes want to be written</h3>
        <div className="stack-list">
          {themeBriefs.length ? (
            themeBriefs.map((brief) => (
              <div key={brief.id ?? brief.label} className="stack-item static">
                <strong>{brief.label ?? "Theme brief"}</strong>
                <span>{brief.title ?? brief.summary ?? "No headline yet."}</span>
                <span>
                  Tone {titleCase(brief.meta?.tone?.primary) || "pending"} · target {brief.meta?.story_targets?.long_form_label ?? "pending"} ·
                  confidence {typeof brief.confidence === "number" ? brief.confidence.toFixed(2) : "0.00"}
                </span>
              </div>
            ))
          ) : (
            <p className="stack-empty">Theme analysis cards will land here once the analyst stage has active theme briefs.</p>
          )}
        </div>
      </section>
    </>
  );
}
