import Image from "next/image";
import Link from "next/link";

import { LandingStatus } from "./LandingStatus";

export default function Home() {
  return (
    <main className="page">
      <nav className="nav">
        <Link className="brand" href="/">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} priority />
          TAPECRACK
        </Link>
        <div className="nav-links">
          <Link href="/studio">Studio</Link>
          <Link href="/onboarding">Onboarding</Link>
        </div>
        <Link className="button ghost" href="/studio">
          Open studio
        </Link>
      </nav>

      <header className="hero">
        <Image
          className="logo-lockup"
          src="/brand/logo.svg"
          alt="TAPECRACK logo"
          width={520}
          height={120}
          priority
        />
        <div className="badge">TAPECRACK · Working Draft</div>
        <h1>Governed data runtime with an actual execution path.</h1>
        <p>
          TAPECRACK runs on the same backend engine as XLCRACK, with a governance-first operator
          experience: ingest, inspect, preview, approve, execute, and export or download.
        </p>
        <div className="actions">
          <Link className="button primary" href="/studio">
            Open studio
          </Link>
          <Link className="button ghost" href="/onboarding">
            View operator quickstart
          </Link>
        </div>
      </header>

      <LandingStatus />

      <section className="storyboard">
        <div className="section-head">
          <h2>Runtime Sequence</h2>
          <p>The branded shell differs, but the core backend process is identical and active.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <span className="tag">Stage 01</span>
            <h3>Ingest and profile</h3>
            <p>Upload raw data and establish schema + sample context immediately.</p>
          </article>
          <article className="story-card">
            <span className="tag">Stage 02</span>
            <h3>Propose program</h3>
            <p>Agent proposes deterministic steps with explicit risk flags.</p>
          </article>
          <article className="story-card">
            <span className="tag">Stage 03</span>
            <h3>Approval control</h3>
            <p>Request approval token before risky transforms are allowed to run.</p>
          </article>
          <article className="story-card">
            <span className="tag">Stage 04</span>
            <h3>Execute and distribute</h3>
            <p>Run versioned outputs, save reusable streams, and export/download results.</p>
          </article>
        </div>
      </section>

      <section className="panel orbit">
        <h2>Operator Runbook</h2>
        <div className="checklist">
          <div className="check">Choose user identity and sign up once</div>
          <div className="check">Upload and analyze dataset in studio</div>
          <div className="check">Preview recipe and validate impact</div>
          <div className="check">Approve and run with version tracking</div>
          <div className="check">Download latest CSV or export to SQL Server</div>
        </div>
      </section>

      <section className="cta">
        <div>
          <h2>Enter the studio control room</h2>
          <p className="muted">Run the full backend-connected flow with branded governance UX.</p>
        </div>
        <div className="actions">
          <Link className="button primary" href="/studio">
            Open studio
          </Link>
          <Link className="button ghost" href="/onboarding">
            Open onboarding
          </Link>
        </div>
      </section>
    </main>
  );
}
