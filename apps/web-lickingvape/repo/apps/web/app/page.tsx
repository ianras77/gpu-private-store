import Image from 'next/image';
import Link from 'next/link';
import { serverApiBase } from './lib/api';
import FeedClient from './FeedClient';
import CheshireChat from './CheshireChat';
import WorldPulse from './WorldPulse';
import {
  editorialLanes,
  homeHighlights,
  howItWorks,
  moodStickers,
  retroApps,
  seussNods,
  starterPosts,
  tickerLines,
  toolkitQuickSteps,
  wallRituals
} from './content';
import type { Post } from './types';

async function getInitialPosts(): Promise<Post[]> {
  try {
    const res = await fetch(`${serverApiBase()}/posts?limit=20&offset=0`, { cache: 'no-store' });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

type Stats = {
  published_posts: number;
  queued_submissions: number;
  total_submissions: number;
};

async function getStats(): Promise<Stats | null> {
  try {
    const res = await fetch(`${serverApiBase()}/stats`, { cache: 'no-store' });
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

export default async function Page() {
  const [posts, stats] = await Promise.all([getInitialPosts(), getStats()]);
  const demoMode = posts.length === 0;
  const feedPosts = demoMode ? starterPosts : posts;
  const tickerLoop = [...tickerLines, ...tickerLines];

  return (
    <div className="stack front-page wall-page">
      <section className="wall-hero">
        <div className="wall-hero-copy">
          <div className="hero-brand-row">
            <Image
              src="/visuals/lickingvape-mark.jpg"
              alt="Licking Vape striped storybook mark"
              width={74}
              height={74}
              className="hero-mark"
              priority
            />
            <div>
              <div className="eyebrow">Anonymous quit wall</div>
              <div className="hero-issue">night issue / stripe 30</div>
            </div>
          </div>
          <h2>Thirty striped urges walked in. Post one down.</h2>
          <p className="lead">
            A dark, modern sideblog for quitting vaping in public-anonymous: craving reports, slip
            receipts, tiny wins, world-noise spirals, and the weird little rituals that get your
            mouth through the hour.
          </p>
          <div className="mood-stickers" aria-label="Site mood">
            {moodStickers.map((item) => (
              <span key={item} className="sticker">
                {item}
              </span>
            ))}
          </div>
          <div className="inline-actions hero-actions">
            <Link className="button" href="/submit">
              Post to the wall
            </Link>
            <Link className="button ghost" href="#feed">
              Read the wall
            </Link>
            <Link className="button ghost" href="#scribe">
              Open the Scribe
            </Link>
          </div>
        </div>

        <aside className="wall-hero-panel">
          <div className="wall-note-stack" aria-label="Wall ritual notes">
            {seussNods.map((line, idx) => (
              <div key={line} className={`paper-note paper-note-${idx + 1}`}>
                {line}
              </div>
            ))}
          </div>
          <div className="stat-row wall-stat-row">
            <div className="stat">
              <div className="stat-value">{stats ? stats.published_posts : '--'}</div>
              <div className="stat-label">wall notes</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats ? stats.queued_submissions : '--'}</div>
              <div className="stat-label">at the desk</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats ? stats.total_submissions : '--'}</div>
              <div className="stat-label">sent in</div>
            </div>
          </div>
        </aside>
      </section>

      <section className="ticker reveal" aria-label="Mood board">
        <div className="ticker-track">
          {tickerLoop.map((line, idx) => (
            <span key={`${line}-${idx}`}>{line}</span>
          ))}
        </div>
      </section>

      <section className="wall-layout reveal" id="feed">
        <aside className="wall-sidebar">
          <div className="wall-sidebar-block">
            <div className="card-eyebrow">Use the wall</div>
            <div className="card-list">
              {wallRituals.map((line) => (
                <div key={line} className="card-list-item">
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div className="wall-sidebar-block">
            <div className="card-eyebrow">What belongs</div>
            <div className="mini-lane-list">
              {editorialLanes.map((item) => (
                <div key={item.title} className="mini-lane">
                  <h4>{item.title}</h4>
                  <p className="muted">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="wall-feed-panel">
          <div className="section-head wall-feed-head">
            <div>
              <h3>Anon Wall</h3>
              <p className="muted">
                Real notes from the queue, plus demo wall posts while the archive wakes up.
              </p>
            </div>
            <Link className="button ghost" href="/submit">
              Add yours
            </Link>
          </div>
          <FeedClient initialPosts={feedPosts} demoMode={demoMode} />
        </div>
      </section>

      <section className="section reveal" id="scribe">
        <div className="section-head">
          <h3>Stripe Scribe</h3>
          <p className="muted">
            Not a generic cheerleader. Pick a mode, bring the hour, and get a concrete next move or
            a wall-post draft. Signed-in threads sync across devices; anonymous local mode still
            works.
          </p>
        </div>
        <CheshireChat />
      </section>

      <section className="section reveal">
        <div className="section-head">
          <h3>How the room stays useful</h3>
        </div>
        <div className="card-grid feature-grid">
          {homeHighlights.map((item) => (
            <div key={item.title} className="card">
              <h4>{item.title}</h4>
              <p className="muted">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <div className="section-head">
          <h3>Side cabinets</h3>
          <p className="muted">Small tools for the minutes when reading the wall is not enough.</p>
        </div>
        <div className="card-grid feature-grid">
          {retroApps.map((item) =>
            item.external ? (
              <a
                key={item.title}
                className="card applet-card"
                href={item.href}
                target="_blank"
                rel="noreferrer"
              >
                <div className="card-eyebrow">{item.eyebrow}</div>
                <h4>{item.title}</h4>
                <p className="muted">{item.description}</p>
                <div className="card-footer">{item.cta} -&gt;</div>
              </a>
            ) : (
              <Link key={item.title} className="card applet-card" href={item.href}>
                <div className="card-eyebrow">{item.eyebrow}</div>
                <h4>{item.title}</h4>
                <p className="muted">{item.description}</p>
                <div className="card-footer">{item.cta} -&gt;</div>
              </Link>
            )
          )}
        </div>
      </section>

      <section className="section reveal" id="world-pulse">
        <div className="section-head">
          <h3>World-noise shelf</h3>
          <p className="muted">
            When the outside world is part of the craving, use one tight search and come back to the
            room before the scroll gets theatrical.
          </p>
        </div>
        <div className="world-grid">
          <WorldPulse />
          <div className="card">
            <div className="card-eyebrow">First ugly minutes</div>
            <h4>Break the ritual before it becomes a plot.</h4>
            <div className="card-list">
              {toolkitQuickSteps.slice(0, 5).map((step) => (
                <div key={step} className="card-list-item">
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="section-head">
          <h3>The queue contract</h3>
        </div>
        <div className="card-grid feature-grid">
          {howItWorks.map((item, idx) => (
            <div key={item.title} className="card">
              <div className="card-index">0{idx + 1}</div>
              <h4>{item.title}</h4>
              <p className="muted">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
