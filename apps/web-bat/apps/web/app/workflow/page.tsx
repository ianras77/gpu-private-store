import Link from "next/link";

import { safeDate } from "@/lib/api";
import { PublicHeader } from "@/components/PublicHeader";
import { cleanCopy, getPublicSiteData, humanizeSlug, themeName } from "@/lib/public-site";

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export default async function WorkflowPage() {
  const {
    draftStories,
    activeThemes,
    latestCycle,
    pipelineRoles,
    researcherResult,
    analystResult,
    writerResult,
    opportunityBoard,
    queryPlan,
  } = await getPublicSiteData();

  const visibleThemes = activeThemes.slice(0, 4);
  const visibleQueries = queryPlan.slice(0, 6);
  const visibleOpportunities = opportunityBoard.slice(0, 4);
  const holdReasons = unique(
    draftStories.flatMap((story) => story.metadata?.style_gate?.reasons ?? []).map((reason) => humanizeSlug(reason)),
  ).slice(0, 4);
  const writerSlate = writerResult?.story_slate?.slice(0, 4) ?? [];

  return (
    <>
      <PublicHeader />
      <main className="page-wrap">
        <section className="page-hero">
          <p className="hero-kicker">Notebook</p>
          <h1>The notebook behind the finished line.</h1>
          <p className="hero-note">
            I keep the notebook open because a voice this particular has to prove it is not just a pose. These are the
            searches, near-misses, drafts, and receipts behind the lines that make it to the front.
          </p>
        </section>

        <section className="process-strip">
          {pipelineRoles.slice(0, 4).map((role) => (
            <article key={role.role} className="process-card">
              <span>{role.title}</span>
              <p>{cleanCopy(role.description)}</p>
            </article>
          ))}
        </section>

        <section className="frontline-grid archive-stats">
          <article className="story-panel">
            <p className="section-kicker">Queries</p>
            <h3>{researcherResult?.query_count ?? visibleQueries.length}</h3>
            <p>The number of strings the latest pass pulled on before any public writing happened.</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Active themes</p>
            <h3>{researcherResult?.themes_active ?? activeThemes.length}</h3>
            <p>Pattern lanes still hot enough to shape the front page, archive, and next round of writing.</p>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Latest pass</p>
            <h3>{latestCycle?.completed_at ? safeDate(latestCycle.completed_at) : "Live now"}</h3>
            <p>Timestamps matter because stale outrage has a way of putting on fresh lipstick.</p>
          </article>
        </section>

        <section className="column-band">
          <article className="story-panel">
            <p className="section-kicker">Opportunity board</p>
            <h3>What kept tugging on my sleeve in the last sweep</h3>
            <div className="stack-list compact">
              {visibleOpportunities.length ? (
                visibleOpportunities.map((item) => (
                  <div key={`${item.slug}-${item.query_hint}`} className="stack-item static">
                    <strong>{cleanCopy(item.theme) || humanizeSlug(item.slug) || "Opportunity board"}</strong>
                    <span>{cleanCopy(item.angle || item.query_hint) || "Still warm enough to deserve another pass."}</span>
                  </div>
                ))
              ) : (
                <p className="stack-empty">The next sweep will refill the board when something keeps tugging hard enough.</p>
              )}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Queries from the desk</p>
            <h3>The exact strings I keep typing when the story still feels slippery</h3>
            <div className="stack-list compact">
              {visibleQueries.length ? (
                visibleQueries.map((query) => (
                  <div key={query} className="stack-item static">
                    <strong>{cleanCopy(query)}</strong>
                    <span>I keep the exact search language because receipts are stronger than mystique.</span>
                  </div>
                ))
              ) : (
                <p className="stack-empty">Fresh search strings will land here with the next completed cycle.</p>
              )}
            </div>
          </article>
        </section>

        <section className="info-grid">
          <article className="story-panel">
            <p className="section-kicker">What the analyst just learned</p>
            <h3>{cleanCopy(analystResult?.site_brief?.title) || cleanCopy(analystResult?.site_brief?.label) || "The next cycle will sharpen the read"}</h3>
            <div className="stack-list compact">
              <div className="stack-item static">
                <strong>Briefs in play</strong>
                <span>{analystResult?.brief_count ?? 0} active analysis brief{analystResult?.brief_count === 1 ? "" : "s"} shaping the desk.</span>
              </div>
              {(analystResult?.theme_briefs ?? []).slice(0, 3).map((brief) => (
                <div key={`${brief.scope_key}-${brief.label}`} className="stack-item static">
                  <strong>{cleanCopy(brief.label) || "Theme brief"}</strong>
                  <span>{cleanCopy(brief.title) || "The analyst stage is mapping the next angle for this lane."}</span>
                </div>
              ))}
              {!analystResult?.theme_briefs?.length ? (
                <div className="stack-item static">
                  <strong>Analysis pulse</strong>
                  <span>The next analysis pass will leave a tone and topic map worth reading.</span>
                </div>
              ) : null}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Where the drafts get caught</p>
            <h3>Not everything deserves to publish just because it exists.</h3>
            <div className="stack-list compact">
              {holdReasons.length ? (
                holdReasons.map((reason) => (
                  <div key={reason} className="stack-item static">
                    <strong>Hold reason</strong>
                    <span>{reason}</span>
                  </div>
                ))
              ) : (
                <div className="stack-item static">
                  <strong>Hold reason</strong>
                  <span>The next stalled draft will have to name what stopped it.</span>
                </div>
              )}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">What the writer just tried</p>
            <h3>The latest slate, before the shelf decides what survives</h3>
            <div className="stack-list compact">
              {writerSlate.length ? (
                writerSlate.map((item) => (
                  <div key={`${item.id}-${item.slug}`} className="stack-item static">
                    <strong>{cleanCopy(item.title) || cleanCopy(item.selected_angle) || "Draft in motion"}</strong>
                    <span>{cleanCopy(item.why_now) || "This angle was live enough to make the slate, even if it did not yet earn the front page."}</span>
                  </div>
                ))
              ) : (
                <p className="stack-empty">The next writer slate will land here when another angle deserves the trouble.</p>
              )}
            </div>
          </article>
        </section>

        <section className="column-band">
          <article className="story-panel">
            <p className="section-kicker">The live theme map</p>
            <h3>The lanes steering the notebook tonight</h3>
            <div className="stack-list compact">
              {visibleThemes.map((theme) => (
                <Link key={theme.slug} href={`/themes/${theme.slug}`} className="stack-item">
                  <strong>{themeName(theme)}</strong>
                  <span>Score {(theme.active_score ?? 0).toFixed(2)}. A lane I am still not done with.</span>
                </Link>
              ))}
            </div>
          </article>

          <article className="story-panel">
            <p className="section-kicker">Why keep the notebook open</p>
            <h3>Trust is easier when the receipts stay close.</h3>
            <p>
              If BAT is going to talk in a voice this particular, the work has to stay close enough to inspect. The
              notebook keeps the archive legible, keeps the argument honest, and reminds me that polish is only worth
              anything when the evidence underneath it is real.
            </p>
            <div className="hero-actions">
              <Link href="/themes" className="button-link muted small">
                Browse the lanes
              </Link>
              <Link href="/archive" className="button-link muted small">
                Read what made it through
              </Link>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
