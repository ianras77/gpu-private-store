import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/users";
import { CHAT_MODES } from "@/lib/rassymind";
import { getRassyMindAdminSnapshot } from "@/lib/rassymind-admin";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    redirect("/login?error=admin_required");
  }

  const snapshot = await getRassyMindAdminSnapshot();
  const liveModels = new Map(snapshot.models.map((model) => [model.id, model]));

  return (
    <main className="admin-shell">
      <section className="admin-header">
        <Link className="back-link" href="/">
          Rassy Online
        </Link>
        <div>
          <p className="system-label">Admin Console</p>
          <h1>Control room for accounts, capabilities, and runtime health.</h1>
        </div>
      </section>

      <section className="admin-grid">
        <article className={`admin-tile admin-status ${snapshot.gateway}`}>
          <p className="admin-kicker">LIVE GATEWAY</p>
          <h2>{snapshot.gateway === "healthy" ? "Operational" : snapshot.gateway === "degraded" ? "Degraded" : "Unreachable"}</h2>
          <p>Protected catalog probe at {process.env.RASSYMIND_BASE_URL ?? "the configured gateway"}</p>
          <small>Checked {snapshot.checkedAt.replace("T", " ").slice(0, 19)} UTC</small>
        </article>
        <article className="admin-tile">
          <p className="admin-kicker">RUNTIME POSTURE</p>
          <h2>Registration</h2>
          <p>{process.env.RASSY_ONLINE_REGISTRATION_POLICY ?? "open"}</p>
        </article>
        <article className="admin-tile">
          <h2>Bootstrap Admin</h2>
          <p>{process.env.RASSY_ONLINE_BOOTSTRAP_ADMIN_EMAIL || "Not configured"}</p>
        </article>
        <article className="admin-tile">
          <p className="admin-kicker">CONTROLLED RELEASE</p>
          <h2>RassyMind</h2>
          <p>Production topology locked</p>
          <small>27B lanes remain one-slot and parallel-2 stays canary-only.</small>
        </article>
        <Link className="admin-tile action" href="/admin/users">
          <h2>Users</h2>
          <p>Review accounts and roles</p>
        </Link>
      </section>

      <section className="admin-section" aria-labelledby="lane-health">
        <div className="admin-section-heading">
          <div>
            <p className="system-label">Runtime catalog</p>
            <h2 id="lane-health">Every public lane, one honest contract.</h2>
          </div>
          <span className="admin-badge">{snapshot.models.length} discovered</span>
        </div>
        <div className="lane-health-grid">
          {CHAT_MODES.filter((mode, index, all) => all.findIndex((item) => item.model === mode.model) === index).map((mode) => {
            const model = liveModels.get(mode.model);
            return (
              <article className="lane-health-card" key={mode.model}>
                <div className="lane-health-top"><span className="lane-sigil">{mode.model.replace("rassy-", "").slice(0, 4).toUpperCase()}</span><span className={`health-dot ${snapshot.gateway}`} /></div>
                <h3>{mode.model}</h3>
                <p>{mode.description}</p>
                <div className="capability-list">{(model?.capabilities ?? ["not observed"]).map((capability) => <span key={capability}>{capability}</span>)}</div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="admin-grid admin-grid-wide">
        <article className="admin-tile admin-note"><p className="admin-kicker">OBSERVABILITY</p><h2>Safe telemetry</h2><p>Aggregate timings, queue state, runtime identity, cancellations, retrieval phases, and voice timings are visible without prompts, outputs, tool arguments, transcripts, or audio.</p></article>
        <article className="admin-tile admin-note"><p className="admin-kicker">RETRIEVAL</p><h2>Evidence with provenance</h2><p>Embedding, dense search, lexical search, fusion, reranking, and packing are measured separately. Duplicate passages are removed and strongest evidence stays at the context edges.</p></article>
        <article className="admin-tile admin-note"><p className="admin-kicker">CANARY</p><h2>Promotion is human-controlled</h2><p>Explicit runtime experiments remain isolated, localhost-only, read-only on model files, GPU-locked, and never receive normal traffic automatically.</p></article>
      </section>
    </main>
  );
}
