import Image from "next/image";
import Link from "next/link";

export default function Onboarding() {
  return (
    <main className="page onboard">
      <nav className="nav">
        <Link className="brand" href="/">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} priority />
          TAPECRACK
        </Link>
        <div className="nav-links">
          <Link href="/">Overview</Link>
          <Link href="/studio">Studio</Link>
        </div>
        <Link className="button ghost" href="/">
          Back to home
        </Link>
      </nav>

      <header className="hero compact">
        <div className="badge">Onboarding · TAPECRACK</div>
        <h1>Set governance context first, then run the same process repeatedly.</h1>
        <p>
          This onboarding points only to active runtime behavior in the studio. Each step maps to
          live backend routes and shared engine capabilities.
        </p>
      </header>

      <section className="storyboard">
        <div className="section-head">
          <h2>Startup Sequence</h2>
          <p>Complete identity and first-run setup, then repeat on every inbound file.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <span className="tag">Setup 01</span>
            <h3>Register operator identity</h3>
            <p>Set user id and display name, then click Sign up once.</p>
          </article>
          <article className="story-card">
            <span className="tag">Setup 02</span>
            <h3>Ingest source feed</h3>
            <p>Upload operational files and pin the active dataset for processing.</p>
          </article>
          <article className="story-card">
            <span className="tag">Setup 03</span>
            <h3>Evaluate impact</h3>
            <p>Inspect preview row deltas and warnings before execution.</p>
          </article>
          <article className="story-card">
            <span className="tag">Setup 04</span>
            <h3>Standardize with streams</h3>
            <p>Save and recognize reusable workstreams for recurring templates.</p>
          </article>
        </div>
      </section>

      <section className="panel orbit">
        <h2>Operator Sequence</h2>
        <div className="checklist">
          <div className="check">Upload CSV/TXT/TSV/XLS/XLSX</div>
          <div className="check">Analyze schema, samples, and profile data</div>
          <div className="check">Generate recipe, validate, and preview impact</div>
          <div className="check">Request approval and execute run</div>
          <div className="check">Download latest CSV or export to SQL Server</div>
        </div>
        <div className="actions">
          <Link className="button primary" href="/studio">
            Open studio now
          </Link>
          <Link className="button ghost" href="/">
            Back to overview
          </Link>
        </div>
      </section>
    </main>
  );
}
