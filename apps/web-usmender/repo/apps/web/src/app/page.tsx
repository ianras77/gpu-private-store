import Link from 'next/link';

const rooms = [
  {
    title: 'Apartment repair',
    meta: '2 people - Matrix room local',
    state: 'Rewrite ready',
    unread: '2'
  },
  {
    title: 'Weekend planning',
    meta: 'Invite accepted',
    state: 'Needs first reply',
    unread: ''
  },
  {
    title: 'Check-in habit',
    meta: 'Follow-up tomorrow',
    state: 'Agreement live',
    unread: ''
  }
];

const pipeline = [
  ['Private draft', 'Raw text stays in USMender, outside the Matrix room.'],
  ['Safety and retrieval', 'Room history, agreements, and boundaries shape the rewrite.'],
  ['Approval preview', 'The sender approves the exact shared wording.'],
  ['Matrix event', 'Only the approved message enters the local room.']
];

const buildTracks = [
  ['Local Matrix core', 'Synapse is the durable room engine. USMender owns the flow users actually touch.'],
  ['USMender clients', 'The mobile-first web app and iOS client show USMender, not a generic Matrix interface.'],
  ['RAG in the send path', 'Retrieval, safety, mediator rewrite, proposals, and memory run as message jobs.']
];

export default function Page() {
  return (
    <main className="messenger-home">
      <section className="messenger-shell">
        <div className="messenger-copy">
          <div className="hero-kicker">Matrix-core repair messenger</div>
          <h1 className="display">USMender starts with the message.</h1>
          <p>
            Matrix becomes the local room engine. USMender becomes the client, the workflow, and
            the safety layer around it: private drafts, mediated previews, approved shared
            messages, and mobile-first rooms.
          </p>
          <div className="cta-row">
            <Link className="button primary" href="/dashboard">
              Open inbox
            </Link>
            <Link className="button secondary" href="/sessions/new">
              Start room
            </Link>
            <Link className="button secondary" href="/login">
              Sign in
            </Link>
          </div>
        </div>

        <div className="messenger-workspace" aria-label="USMender messenger preview">
          <div className="workspace-sidebar">
            <div className="workspace-label">Inbox</div>
            <div className="conversation-list">
              {rooms.map((room, index) => (
                <div
                  className={index === 0 ? 'conversation-card active' : 'conversation-card'}
                  key={room.title}
                >
                  <div>
                    <strong>{room.title}</strong>
                    <span>{room.meta}</span>
                  </div>
                  <div className="conversation-card-foot">
                    <span>{room.state}</span>
                    {room.unread ? <b>{room.unread}</b> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="workspace-thread">
            <div className="thread-topbar">
              <div>
                <strong>Apartment repair</strong>
                <span>Shared Matrix room - private drafts on</span>
              </div>
              <span className="signal-pill">Mediator online</span>
            </div>

            <div className="chat-stack">
              <div className="phone-bubble other">
                I can talk tonight. I want this to feel fair, not like we are keeping score.
              </div>
              <div className="phone-bubble self">Raw draft saved privately in USMender.</div>
              <div className="phone-bubble mediator">
                Rewrite ready: I need more notice before plans change, and I want us to choose a
                simple way to check in before decisions are final.
              </div>
            </div>

            <div className="draft-panel">
              <div>
                <span>Approval preview</span>
                <strong>Send the mediated version to Matrix</strong>
              </div>
              <Link className="button primary compact" href="/dashboard">
                Review
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="message-plan-grid">
        {buildTracks.map(([title, detail]) => (
          <div className="feature-card" key={title}>
            <strong>{title}</strong>
            <div className="microcopy">{detail}</div>
          </div>
        ))}
      </section>

      <section className="pipeline-band">
        <div>
          <div className="section-label">Message pipeline</div>
          <h2>Every shared message is a deliberate local Matrix event.</h2>
        </div>
        <div className="pipeline-list">
          {pipeline.map(([title, detail], index) => (
            <div className="pipeline-item" key={title}>
              <span>{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <div className="microcopy">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="journey">
        <div className="section-label">Rebuilt app plan</div>
        <h2>Matrix stays updateable. USMender stays the experience.</h2>
        <div className="journey-grid">
          {[
            ['Phase 0', 'Harden the current local bridge: inbox, thread, drafts, approvals, and event ledger.'],
            ['Phase 1', 'Move posting, reads, delivery, and presence behind a Matrix-ready provider interface.'],
            ['Phase 2', 'Add local Synapse and a USMender appservice as the core messaging engine.'],
            ['Phase 3', 'Polish the PWA and native mobile clients around the thread-first workflow.']
          ].map(([title, detail]) => (
            <div className="journey-card" key={title}>
              <strong>{title}</strong>
              <div className="microcopy">{detail}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="lane-header">
          <div>
            <div className="pill">Safety contract</div>
            <h2>Raw drafts stay private. Matrix rooms stay intentional.</h2>
          </div>
          <Link className="button secondary" href="/settings">
            Trust settings
          </Link>
        </div>
        <p className="microcopy">
          USMender owns the composer so the mediator can pause unsafe drafts, retrieve the right
          context, and ask for approval before anything reaches the local Matrix room.
        </p>
      </section>
    </main>
  );
}
