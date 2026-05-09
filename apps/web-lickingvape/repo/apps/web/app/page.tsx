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
  worldPrompts
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
    <div className="stack front-page">
      <section className="hero hero-home">
        <div className="hero-content">
          <div className="eyebrow">Velvet-static quit blog</div>
          <h2>Post the craving before it turns into a ghost story.</h2>
          <p className="lead">
            Licking Vape is a dark, feed-first sideblog for quitting nicotine out loud while life,
            headlines, and 2am feelings keep happening.
          </p>
          <div className="mood-stickers" aria-label="Site mood">
            {moodStickers.map((item) => (
              <span key={item} className="sticker">
                {item}
              </span>
            ))}
          </div>
          <div className="inline-actions">
            <Link className="button" href="/submit">
              Leave a note
            </Link>
            <Link className="button ghost" href="#feed">
              Read the night scroll
            </Link>
            <Link className="button ghost" href="#cheshire">
              Talk to Cheshire
            </Link>
          </div>
          <div className="stat-row">
            <div className="stat">
              <div className="stat-value">{stats ? stats.published_posts : '--'}</div>
              <div className="stat-label">Published notes</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats ? stats.queued_submissions : '--'}</div>
              <div className="stat-label">Waiting at the desk</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats ? stats.total_submissions : '--'}</div>
              <div className="stat-label">Total entries</div>
            </div>
          </div>
        </div>

        <aside className="hero-card">
          <div className="card-eyebrow">From the night desk</div>
          <h3>Leave the mood in ink, not vapor.</h3>
          <div className="card-list">
            {seussNods.map((line) => (
              <div key={line} className="card-list-item">
                {line}
              </div>
            ))}
          </div>
          <div className="scribble-note">curated by the den, survived by the den</div>
          <div className="card-footer">
            <Link href="/submit">Leave tonight&apos;s note -&gt;</Link>
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

      <section className="section reveal">
        <div className="section-head">
          <h3>What belongs here</h3>
          <p className="muted">
            Nicotine is one chapter. Life, the internet, and the state of the world get to show up
            too.
          </p>
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
          <h3>Open tabs for the night desk</h3>
          <p className="muted">
            The curator voice here is broader on purpose. We are not pretending quitting nicotine
            happens in a vacuum.
          </p>
        </div>
        <div className="card-grid feature-grid">
          {editorialLanes.map((item) => (
            <div key={item.title} className="card">
              <h4>{item.title}</h4>
              <p className="muted">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section reveal">
        <div className="section-head">
          <h3>Little appy things, but cooler</h3>
          <p className="muted">
            Each tool is pointed at the same goal: interrupt the spiral, say the true thing, stay
            in the room.
          </p>
        </div>
        <div className="card-grid feature-grid">
          {retroApps.map((item) =>
            item.external ? (
              <a key={item.title} className="card applet-card" href={item.href} target="_blank" rel="noreferrer">
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
          <h3>Current-world detour</h3>
          <p className="muted">
            The den is already pulling a current-world pulse on a timer. When the headlines, the
            timeline, or the general state of everything is part of the craving, do not pretend
            otherwise.
          </p>
        </div>
        <div className="world-grid">
          <WorldPulse />
          <div className="card">
            <div className="card-eyebrow">How to use it</div>
            <h4>Let the desk auto-listen. Step in when a thread needs you.</h4>
            <div className="card-list">
              {worldPrompts.map((line) => (
                <div key={line} className="card-list-item">
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="section-head">
          <h3>How the night desk works</h3>
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

      <section className="section reveal" id="cheshire">
        <div className="section-head">
          <h3>Cheshire Cat, in curator mode</h3>
          <p className="muted">
            Part quit companion, part moody blogger, part archive keeper. Cheshire can talk
            nicotine, life, headlines, and whatever else is scratching at the window.
          </p>
        </div>
        <CheshireChat />
      </section>

      <section className="section reveal">
        <div className="section-head">
          <h3>When the room goes theatrical</h3>
          <p className="muted">Quick rituals for the first ugly minutes.</p>
        </div>
        <div className="card-list">
          {toolkitQuickSteps.slice(0, 4).map((step) => (
            <div key={step} className="card-list-item">
              {step}
            </div>
          ))}
        </div>
        <div className="inline-actions">
          <Link className="button ghost" href="/toolkit">
            Open the full kit
          </Link>
          <Link className="button ghost" href="/timer">
            Start a wave timer
          </Link>
        </div>
      </section>

      <section className="section reveal" id="feed">
        <div className="section-head">
          <h3>Night scroll</h3>
          <p className="muted">
            Curated notes, rough confessions, and live entries from people trying to leave nicotine
            behind in real time.
          </p>
        </div>
        <FeedClient initialPosts={feedPosts} demoMode={demoMode} />
      </section>
    </div>
  );
}
