'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

const feelings = [
  'Tender',
  'Tense',
  'Hurt',
  'Overwhelmed',
  'Defensive',
  'Hopeful',
  'Calmer',
  'Ready'
];

const microSteps = [
  {
    title: 'Notice the moment',
    detail: 'Say what happened without assigning motive.'
  },
  {
    title: 'Own the feeling',
    detail: 'Choose a feeling you can stand behind without blaming the other person.'
  },
  {
    title: 'Name the need',
    detail: 'Clarity, rest, care, honesty, space, reassurance, or follow-through.'
  },
  {
    title: 'Ask gently',
    detail: 'Shape one concrete request the mediator could help you send later.'
  }
];

export default function DailyPage() {
  const [moment, setMoment] = useState('Plans changed after I thought we had already agreed.');
  const [need, setNeed] = useState('I need a quick check-in before decisions become final.');
  const [smallAsk, setSmallAsk] = useState('Could we send one message before changing shared plans?');
  const [boundary, setBoundary] = useState('No pressure to solve it on the spot.');
  const [selectedFeeling, setSelectedFeeling] = useState('Tense');
  const [draft, setDraft] = useState<string | null>(null);

  const neutralDraft = useMemo(() => {
    return [
      'Mediator-ready draft',
      '',
      `Situation: ${moment}`,
      `Feeling: ${selectedFeeling}`,
      `Need: ${need}`,
      `Small ask: ${smallAsk}`,
      `Boundary: ${boundary}`
    ].join('\n');
  }, [moment, need, smallAsk, boundary, selectedFeeling]);

  return (
    <main>
      <section className="page-header">
        <div className="pill">Daily repair</div>
        <h1>Practice the softer version before the real conversation begins.</h1>
        <p className="microcopy">
          This is your emotional warm-up space: a mobile-first check-in that helps you move from
          raw reaction toward something more shareable.
        </p>
      </section>

      <section className="reflection-grid">
        <div className="card">
          <h2>Today&apos;s repair steps</h2>
          <div className="timeline" style={{ marginTop: 16 }}>
            {microSteps.map((step) => (
              <div className="timeline-item" key={step.title}>
                <strong>{step.title}</strong>
                <div className="microcopy">{step.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="pill">Why it helps</div>
          <h2>Small rituals make big conflicts less explosive.</h2>
          <ul className="meta-list" style={{ marginTop: 16 }}>
            <li>You build language for what is true without sounding like an attack.</li>
            <li>You slow your nervous system down before pressing send.</li>
            <li>You collect better raw material for the mediator to work with later.</li>
          </ul>
        </div>
      </section>

      <section className="card form">
        <h2>Repair rehearsal</h2>

        <div>
          <label className="label" htmlFor="moment">
            What happened?
          </label>
          <textarea
            className="textarea"
            id="moment"
            rows={3}
            value={moment}
            onChange={(event) => setMoment(event.currentTarget.value)}
          />
        </div>

        <div>
          <label className="label">How do you feel?</label>
          <div className="chip-grid">
            {feelings.map((feeling) => (
              <button
                key={feeling}
                type="button"
                className={`chip-button ${selectedFeeling === feeling ? 'active' : ''}`}
                onClick={() => setSelectedFeeling(feeling)}
              >
                {feeling}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-two">
          <div>
            <label className="label" htmlFor="need">
              What do you need?
            </label>
            <input
              className="input"
              id="need"
              value={need}
              onChange={(event) => setNeed(event.currentTarget.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="smallAsk">
              One gentle ask
            </label>
            <input
              className="input"
              id="smallAsk"
              value={smallAsk}
              onChange={(event) => setSmallAsk(event.currentTarget.value)}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="boundary">
            Boundary for the conversation
          </label>
          <input
            className="input"
            id="boundary"
            value={boundary}
            onChange={(event) => setBoundary(event.currentTarget.value)}
          />
        </div>

        <div className="cta-row">
          <button className="button primary" type="button" onClick={() => setDraft(neutralDraft)}>
            Generate repair draft
          </button>
          <Link className="button secondary" href="/sessions/new">
            Turn this into a room
          </Link>
        </div>

        {draft && (
          <div className="preview">
            <div className="preview-label">Mediator-ready notes</div>
            <pre className="preview-box">{draft}</pre>
          </div>
        )}
      </section>
    </main>
  );
}
