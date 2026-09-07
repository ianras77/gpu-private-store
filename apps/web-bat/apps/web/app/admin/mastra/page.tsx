import { apiGet, safeDate } from "@/lib/api";

type IntegrationStatus = {
  orchestrator: string;
  contract_version: string;
  counts: { runs: number; stages: number; active_persona_memory: number; packages: number; published_packages: number };
  latest_run?: { id: string; workflow: string; status: string; directive: string; created_at: string; completed_at?: string; published_at?: string };
};

export default async function MastraOperatorPage() {
  let status: IntegrationStatus | null = null;
  try {
    status = await apiGet<IntegrationStatus>("/api/v1/integration/status");
  } catch {
    status = null;
  }
  return (
    <section>
      <p className="eyebrow">Mastra control plane</p>
      <h1>Editorial continuity</h1>
      <p className="lede">One person-blogger cycle, visible from evidence through publication.</p>
      {!status ? <p role="status">The Mastra integration feed is unavailable.</p> : (
        <>
          <div className="admin-status-grid">
            <article className="mission-stat"><span>Orchestrator</span><strong>{status.orchestrator}</strong><p>{status.contract_version}</p></article>
            <article className="mission-stat"><span>Editorial runs</span><strong>{status.counts.runs}</strong><p>{status.counts.stages} persisted stages</p></article>
            <article className="mission-stat"><span>Published packages</span><strong>{status.counts.published_packages}</strong><p>{status.counts.packages} total packages</p></article>
            <article className="mission-stat"><span>Persona memory</span><strong>{status.counts.active_persona_memory}</strong><p>active durable memories</p></article>
          </div>
          {status.latest_run ? <article className="story-panel">
            <p className="eyebrow">Latest run · {status.latest_run.workflow}</p>
            <h2>{status.latest_run.status}</h2>
            <p>{status.latest_run.directive}</p>
            <p className="muted">Started {safeDate(status.latest_run.created_at)}{status.latest_run.completed_at ? ` · completed ${safeDate(status.latest_run.completed_at)}` : ""}{status.latest_run.published_at ? ` · published ${safeDate(status.latest_run.published_at)}` : ""}</p>
            <p className="muted">Run ID: {status.latest_run.id}</p>
          </article> : <p>No Mastra run has been recorded yet.</p>}
        </>
      )}
    </section>
  );
}
