import Image from "next/image";
import Link from "next/link";

import { LandingStatus } from "./LandingStatus";

export default function Home() {
  return (
    <main className="page">
      <nav className="nav">
        <Link className="brand" href="/">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} priority />
          XLCRACK
        </Link>
        <div className="nav-links">
          <Link href="/playground">Playground</Link>
          <Link href="/onboarding">Onboarding</Link>
        </div>
        <Link className="button ghost" href="/playground">
          Open playground
        </Link>
      </nav>

      <header className="hero">
        <Image
          className="logo-lockup"
          src="/brand/logo.svg"
          alt="XLCRACK logo"
          width={540}
          height={120}
          priority
        />
        <div className="badge">XLCRACK · Working Draft</div>
        <h1>Spreadsheet cleanup that actually runs end-to-end.</h1>
        <p>
          XLCRACK turns one-off spreadsheet cleanup into a repeatable flow: upload raw files,
          inspect structure, run agentic previews, approve risky changes, and execute versioned
          transformations with direct download.
        </p>
        <div className="actions">
          <Link className="button primary" href="/playground">
            Start in playground
          </Link>
          <Link className="button ghost" href="/onboarding">
            See quickstart
          </Link>
        </div>
      </header>

      <section className="stats">
        <article className="stat">
          <h3>1</h3>
          <span>Shared backend model</span>
        </article>
        <article className="stat">
          <h3>2</h3>
          <span>Brand shells, one engine</span>
        </article>
        <article className="stat">
          <h3>7-step</h3>
          <span>Upload to download workflow</span>
        </article>
      </section>

      <LandingStatus />

      <section className="storyboard">
        <div className="section-head">
          <h2>What the app does right now</h2>
          <p>The landing flow maps directly to the working backend behavior.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <span className="tag">Step 01</span>
            <h3>Bring raw files in</h3>
            <p>CSV, TXT, TSV, and Excel uploads become tenant-scoped datasets.</p>
          </article>
          <article className="story-card">
            <span className="tag">Step 02</span>
            <h3>Inspect shape and quality</h3>
            <p>Schema, sample rows, and column profiles are pulled through tool calls.</p>
          </article>
          <article className="story-card">
            <span className="tag">Step 03</span>
            <h3>Preview and approve changes</h3>
            <p>Recipe validation and preview happen before execution for risky transforms.</p>
          </article>
          <article className="story-card">
            <span className="tag">Step 04</span>
            <h3>Run, save, and reuse</h3>
            <p>Save user workstreams, rerun on new files, and download latest CSV output.</p>
          </article>
        </div>
      </section>

      <section className="panel runbook">
        <h2>Quick Process</h2>
        <div className="checklist">
          <div className="check">Sign up once with a user id in the toolbar</div>
          <div className="check">Upload file and analyze schema + sample + profiles</div>
          <div className="check">Generate recipe preview with agentic steps</div>
          <div className="check">Request approval and run transformation</div>
          <div className="check">Save workstream or download latest CSV</div>
        </div>
      </section>

      <section className="cta">
        <div>
          <h2>Ready to run a real draft flow?</h2>
          <p className="muted">
            Open the playground and execute the full process against the shared backend now.
          </p>
        </div>
        <div className="actions">
          <Link className="button primary" href="/playground">
            Open playground
          </Link>
          <Link className="button ghost" href="/onboarding">
            Open quickstart
          </Link>
        </div>
      </section>
    </main>
  );
}
