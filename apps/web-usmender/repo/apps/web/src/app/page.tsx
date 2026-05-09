import Link from 'next/link';

export default function Page() {
  return (
    <main>
      <section className="hero-surface">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="hero-kicker">Love-led conflict repair</div>
            <h1 className="display">A mediation inbox that helps people hear each other again.</h1>
            <p>
              USMender feels like a messaging app, but every message passes through a kind,
              structured LLM mediator first. You write privately, approve the rewrite, and
              send something safer, clearer, and more human.
            </p>
            <div className="cta-row">
              <Link className="button primary" href="/login">
                Create account
              </Link>
              <Link className="button secondary" href="/dashboard">
                Open the inbox
              </Link>
              <Link className="button secondary" href="/sessions/new">
                Start a new room
              </Link>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <strong>Private first</strong>
                <div className="microcopy">Raw feelings stay between you and the mediator.</div>
              </div>
              <div className="stat-card">
                <strong>Mutual clarity</strong>
                <div className="microcopy">The other person only sees respectful, approved language.</div>
              </div>
              <div className="stat-card">
                <strong>Real steps</strong>
                <div className="microcopy">Every room moves toward understanding and a fair plan.</div>
              </div>
            </div>
          </div>

          <div className="phone-frame">
            <div className="phone-screen">
              <div className="phone-status">
                <span>Live room</span>
                <span>Mediator on</span>
              </div>

              <div className="phone-group">
                <div className="phone-row">
                  <strong>Kitchen tension</strong>
                  <div className="microcopy">Shared apartment • waiting on one reply</div>
                </div>
                <div className="badge-row">
                  <span className="signal-pill">Safety filters active</span>
                  <span className="signal-pill">Reply coaching on</span>
                </div>
              </div>

              <div className="phone-group">
                <div className="phone-bubble self">
                  I feel ignored when plans change without me knowing first.
                </div>
                <div className="phone-bubble mediator">
                  I can help phrase that as a request for more notice and shared decision-making.
                </div>
                <div className="phone-bubble other">
                  Shared summary: They want a quick heads-up before decisions are finalized.
                </div>
                <div className="phone-bubble mediator">
                  Next step: invite the other person to share what makes timing hard on their side.
                </div>
              </div>

              <div className="phone-group">
                <div className="phone-row">
                  <strong>Resolution draft</strong>
                  <div className="microcopy">
                    Weekly 15-minute check-in, same-day updates for major decisions.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        {[
          [
            'Sign up and start fast',
            'Create an account, find people, and open a mediation room in under two minutes.'
          ],
          [
            'Invite by search or email',
            'Look up existing users or invite someone new with a warm, neutral message.'
          ],
          [
            'Approve every rewrite',
            'The LLM never forwards your raw message directly. You stay in control of what is sent.'
          ]
        ].map(([title, detail]) => (
          <div className="feature-card" key={title}>
            <strong>{title}</strong>
            <div className="microcopy">{detail}</div>
          </div>
        ))}
      </section>

      <section className="journey">
        <div className="section-label">How mediation moves</div>
        <h2>Built for real relationships, not debate club.</h2>
        <div className="journey-grid">
          {[
            ['1. Private draft', 'Say the hard thing honestly in your own words.'],
            ['2. Gentle rewrite', 'The mediator removes heat, blame, and escalation.'],
            ['3. Perspective coaching', 'Each person gets help seeing the need behind the issue.'],
            ['4. Shared proposal', 'The room ends with concrete next steps both people can vote on.']
          ].map(([title, detail]) => (
            <div className="journey-card" key={title}>
              <strong>{title}</strong>
              <div className="microcopy">{detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="story-grid">
        <div className="story-card">
          <strong>Feels like chat</strong>
          <div className="microcopy">
            The interface is familiar: inboxes, message bubbles, invitations, status updates,
            and live conversation rooms.
          </div>
        </div>
        <div className="story-card">
          <strong>Acts like care</strong>
          <div className="microcopy">
            The mediator slows things down, protects dignity, and nudges both people toward
            understanding before solutions.
          </div>
        </div>
        <div className="story-card">
          <strong>Designed for mobile</strong>
          <div className="microcopy">
            Every screen is mobile-first so it can translate cleanly into a polished iOS app.
          </div>
        </div>
      </section>

      <section className="card">
        <div className="lane-header">
          <div>
            <div className="pill">Safety matters</div>
            <h2>Human, helpful, and calm on purpose.</h2>
          </div>
          <Link className="button secondary" href="/settings">
            See trust settings
          </Link>
        </div>
        <p className="microcopy">
          If the system detects coercion, threats, or unsafe language, it pauses the room instead
          of sending the message. Repair should never come at the cost of safety.
        </p>
      </section>
    </main>
  );
}
