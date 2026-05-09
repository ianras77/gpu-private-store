import Image from "next/image";
import Link from "next/link";

export default function Onboarding() {
  return (
    <main className="page onboard">
      <nav className="nav">
        <Link className="brand" href="/">
          <Image src="/brand/mark.svg" alt="" width={32} height={32} priority />
          XLCRACK
        </Link>
        <div className="nav-links">
          <Link href="/">Overview</Link>
          <Link href="/playground">Playground</Link>
        </div>
        <Link className="button ghost" href="/">
          Back to home
        </Link>
      </nav>

      <header className="hero compact">
        <div className="badge">Onboarding · XLCRACK</div>
        <h1>Set up once, then run the same cleanup flow every time.</h1>
        <p>
          This onboarding only covers working behavior. No dead steps, no placeholder controls.
          Everything here maps to active backend routes in the playground.
        </p>
      </header>

      <section className="storyboard">
        <div className="section-head">
          <h2>Setup Path</h2>
          <p>Complete these once, then repeat the run flow for each new file.</p>
        </div>
        <div className="story-grid">
          <article className="story-card">
            <span className="tag">Setup 01</span>
            <h3>Pick user identity</h3>
            <p>Set user id + display name, then click Sign up once.</p>
          </article>
          <article className="story-card">
            <span className="tag">Setup 02</span>
            <h3>Upload source file</h3>
            <p>Bring in CSV/TXT/TSV/XLS/XLSX from your source system.</p>
          </article>
          <article className="story-card">
            <span className="tag">Setup 03</span>
            <h3>Generate safe recipe</h3>
            <p>Preview row impact first, then approve and run.</p>
          </article>
          <article className="story-card">
            <span className="tag">Setup 04</span>
            <h3>Save stream for reuse</h3>
            <p>Save as a user workstream and apply it to the next matching file.</p>
          </article>
        </div>
      </section>

      <section className="panel runbook">
        <h2>Operator Sequence</h2>
        <div className="checklist">
          <div className="check">Upload and select active dataset</div>
          <div className="check">Analyze with schema/sample/profile calls</div>
          <div className="check">Run prompt for recipe preview and risk flags</div>
          <div className="check">Request approval token and execute run</div>
          <div className="check">Save/recognize/rerun workstreams per user</div>
          <div className="check">Download latest CSV or export to SQL Server</div>
        </div>
        <div className="actions">
          <Link className="button primary" href="/playground">
            Open playground now
          </Link>
          <Link className="button ghost" href="/">
            Back to overview
          </Link>
        </div>
      </section>
    </main>
  );
}
