import Link from 'next/link';
import WorldPulse from '../WorldPulse';
import { supportResources, toolkitPlan, toolkitQuickSteps, toolkitReset, worldPrompts } from '../content';

export default function ToolkitPage() {
  return (
    <section className="stack">
      <div className="section-head">
        <h2>Backup rituals</h2>
        <p className="muted">
          The feed is still the heart of the app. This page is the box of backups for when the room
          gets loud, the urge gets theatrical, or the world starts making your hands itchy.
        </p>
      </div>

      <div className="card-grid feature-grid">
        <div className="card">
          <div className="card-eyebrow">Right now</div>
          <h3>Break the wave</h3>
          <div className="card-list">
            {toolkitQuickSteps.map((step) => (
              <div key={step} className="card-list-item">
                {step}
              </div>
            ))}
          </div>
          <div className="card-footer">
            <Link href="/timer">Start the timer -&gt;</Link>
          </div>
        </div>

        <div className="card">
          <div className="card-eyebrow">This week</div>
          <h3>Build the room on purpose</h3>
          <div className="card-list">
            {toolkitPlan.map((step) => (
              <div key={step} className="card-list-item">
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-eyebrow">After a slip</div>
          <h3>Reset without cosplay</h3>
          <div className="card-list">
            {toolkitReset.map((step) => (
              <div key={step} className="card-list-item">
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="world-grid">
        <WorldPulse
          compact
          title="Check the live pulse, then come back to your body."
          note="Useful when the ingest already caught the vibe and you only need manual search for one specific rabbit hole."
        />
        <div className="card">
          <div className="card-eyebrow">World-noise ritual</div>
          <h3>Do not let the timeline narrate you.</h3>
          <div className="card-list">
            {worldPrompts.map((item) => (
              <div key={item} className="card-list-item">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-head">
        <h3>Trusted support links</h3>
        <p className="muted">
          If you want a live human, structured coaching, or a text-based support layer outside the
          den, these services can help.
        </p>
      </div>
      <div className="card-grid feature-grid">
        {supportResources.map((item) => (
          <a
            key={item.title}
            className="card resource-card"
            href={item.href}
            target="_blank"
            rel="noreferrer"
          >
            <div className="card-eyebrow">{item.meta}</div>
            <h4>{item.title}</h4>
            <p className="muted">{item.description}</p>
          </a>
        ))}
      </div>

      <div className="callout">
        If you feel unsafe or overwhelmed, contact local emergency services or the 988 Lifeline.
      </div>
    </section>
  );
}
