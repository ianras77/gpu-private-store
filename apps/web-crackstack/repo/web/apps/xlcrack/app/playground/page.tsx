import Image from "next/image";
import Link from "next/link";

import { PlaygroundClient } from "./PlaygroundClient";

export default function Playground() {
  return (
    <main className="page playground">
      <nav className="nav">
        <Link className="brand" href="/">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} priority />
          XLCRACK
        </Link>
        <div className="nav-links">
          <Link href="/">Overview</Link>
          <Link href="/onboarding">Onboard</Link>
        </div>
        <Link className="button ghost" href="/onboarding">
          Start a crack
        </Link>
      </nav>

      <header className="hero compact">
        <div className="badge">Playground · XLCRACK</div>
        <h1>Operate the cleanup pipeline, not just a chat window.</h1>
        <p>
          This workspace is wired to live backend routes. Every major action here is a tool-backed
          step with visible outputs and versioned results.
        </p>
      </header>

      <section className="panel runbook">
        <h2>What To Run First</h2>
        <div className="checklist">
          <div className="check">Sign up once or switch user id</div>
          <div className="check">Upload dataset and click Analyze dataset</div>
          <div className="check">Run preview prompt and inspect risk flags</div>
          <div className="check">Request approval and run recipe</div>
          <div className="check">Download latest CSV or save workstream</div>
        </div>
      </section>

      <PlaygroundClient />

      <section className="storyboard">
        <div className="section-head">
          <h2>Storyboard the transformation</h2>
          <p>Every frame is a tool call with an auditable output.</p>
        </div>
        <div className="story-grid">
          <div className="story-card">
            <span className="tag">Frame 01</span>
            <h3>Ingest & fingerprint</h3>
            <p>Capture raw file state, schema, and row counts.</p>
            <span className="chip">get_schema · profile_columns</span>
          </div>
          <div className="story-card">
            <span className="tag">Frame 02</span>
            <h3>Draft recipe</h3>
            <p>LLM proposes structured steps with risk flags.</p>
            <span className="chip">propose_recipe</span>
          </div>
          <div className="story-card">
            <span className="tag">Frame 03</span>
            <h3>Preview & validate</h3>
            <p>See diff impact and require approval.</p>
            <span className="chip">validate_recipe · preview_recipe</span>
          </div>
          <div className="story-card">
            <span className="tag">Frame 04</span>
            <h3>Run & version</h3>
            <p>Execute in a durable workflow. New version every run.</p>
            <span className="chip">run_recipe</span>
          </div>
        </div>
      </section>
    </main>
  );
}
