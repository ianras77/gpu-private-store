import Image from "next/image";
import Link from "next/link";

import { StudioClient } from "./StudioClient";

export default function Studio() {
  return (
    <main className="page studio">
      <nav className="nav">
        <Link className="brand" href="/">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} priority />
          TAPECRACK
        </Link>
        <div className="nav-links">
          <Link href="/">Overview</Link>
          <Link href="/onboarding">Onboard</Link>
        </div>
        <Link className="button ghost" href="/onboarding">
          Build a program
        </Link>
      </nav>

      <header className="hero compact">
        <div className="badge">Studio · TAPECRACK</div>
        <h1>Operate the governed pipeline with full backend control.</h1>
        <p>
          This studio uses live backend routes for datasets, workstreams, user identity, and
          execution outputs. Every stage is visible and auditable.
        </p>
      </header>

      <section className="panel orbit">
        <h2>Run Order</h2>
        <div className="checklist">
          <div className="check">Confirm user profile and active dataset</div>
          <div className="check">Analyze schema and profile shape</div>
          <div className="check">Preview recipe and inspect warnings</div>
          <div className="check">Approve + run transformation</div>
          <div className="check">Download CSV or export table</div>
        </div>
      </section>

      <StudioClient />

      <section className="storyboard">
        <div className="section-head">
          <h2>Storyboard the program lifecycle</h2>
          <p>Guardrails are enforced at every frame, every run.</p>
        </div>
        <div className="story-grid">
          <div className="story-card">
            <span className="tag">Frame 01</span>
            <h3>Ingest + detect drift</h3>
            <p>Schema fingerprints block mismatched inputs.</p>
            <span className="chip">get_schema · profile_columns</span>
          </div>
          <div className="story-card">
            <span className="tag">Frame 02</span>
            <h3>Draft recipe</h3>
            <p>LLM proposes a deterministic program.</p>
            <span className="chip">propose_recipe</span>
          </div>
          <div className="story-card">
            <span className="tag">Frame 03</span>
            <h3>Validate + preview</h3>
            <p>Row loss and schema changes are flagged.</p>
            <span className="chip">validate_recipe · preview_recipe</span>
          </div>
          <div className="story-card">
            <span className="tag">Frame 04</span>
            <h3>Approve + run</h3>
            <p>Runs execute in Temporal with lineage.</p>
            <span className="chip">request_approval · run_recipe</span>
          </div>
        </div>
      </section>
    </main>
  );
}
