'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { submitNotes, submitPrompts } from '../content';
import { publicApiBase } from '../lib/api';

const authTokenStorageKey = 'lv.auth.token.v1';
const MAX_POST_CHARS = 1200;

export default function SubmitPage() {
  const [body, setBody] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'info' | 'error'>('info');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(authTokenStorageKey);
    if (!storedToken) return;

    setToken(storedToken);

    fetch(`${publicApiBase()}/auth/me`, {
      headers: {
        Authorization: `Bearer ${storedToken}`
      }
    })
      .then((res) => {
        if (res.status === 401) {
          window.localStorage.removeItem(authTokenStorageKey);
          setToken(null);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (!data?.user?.display_name) return;
        setDisplayName((prev) => prev || String(data.user.display_name));
      })
      .catch(() => {
        // Ignore session lookup failures on submit page.
      });
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setStatusTone('error');
      setStatus('Write something before you send it to the desk.');
      return;
    }
    if (trimmedBody.length > MAX_POST_CHARS) {
      setStatusTone('error');
      setStatus(`Keep it under ${MAX_POST_CHARS} characters.`);
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${publicApiBase()}/submit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          body: trimmedBody,
          display_name: displayName || null,
          anonymous
        })
      });

      if (res.ok) {
        setBody('');
        if (anonymous || !token) {
          setDisplayName('');
        }
        setAnonymous(false);
        setStatusTone('info');
        setStatus('Queued for the night desk. It will hit the scroll after review.');
      } else {
        if (res.status === 401) {
          window.localStorage.removeItem(authTokenStorageKey);
          setToken(null);
        }
        const data = (await res.json().catch(() => ({}))) as { detail?: string };
        setStatusTone('error');
        setStatus(data.detail || 'Could not send that note.');
      }
    } catch {
      setStatusTone('error');
      setStatus('Signal dropped while sending. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const seedPrompt = (prompt: string) => {
    setBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${prompt}` : prompt));
  };

  return (
    <section className="stack">
      <div className="section-head">
        <h2>Leave a note for the queue</h2>
        <p className="muted">
          Confession, craving log, headline aftermath, ugly win, one-line survival note. Raw is
          welcome.
        </p>
      </div>

      <div className="split-layout">
        <form onSubmit={onSubmit} className="card form-panel">
          <div className="callout">The night desk reviews every post before it lands in the scroll.</div>

          <div>
            <div className="card-eyebrow">Prompt shelf</div>
            <div className="prompt-grid">
              {submitPrompts.map((prompt) => (
                <button key={prompt} type="button" className="prompt-chip" onClick={() => seedPrompt(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="displayName">Name (optional)</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Leave blank if you want the note unsigned"
              disabled={anonymous}
            />
          </div>

          <div>
            <label htmlFor="body">Your note</label>
            <textarea
              id="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What happened, what hurt, what helped, what the world did to your head, what you need the room to know..."
              maxLength={MAX_POST_CHARS}
              required
            />
            <div className="small input-counter">
              {body.length}/{MAX_POST_CHARS}
            </div>
          </div>

          <label className="checkbox-row" htmlFor="anonymous">
            <input
              id="anonymous"
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Post as anonymous</span>
          </label>

          <div className="inline-actions">
            <button type="submit" disabled={loading || !body.trim()}>
              {loading ? 'Sending...' : 'Send to the desk'}
            </button>
            <Link className="button ghost" href="/timer">
              Need a minute first?
            </Link>
          </div>
          {status ? <div className={`small ${statusTone === 'error' ? 'status-error' : ''}`}>{status}</div> : null}
        </form>

        <aside className="stack">
          <div className="card">
            <div className="card-eyebrow">House style</div>
            <h3>Leave the first-draft version.</h3>
            <div className="card-list">
              {submitNotes.map((item) => (
                <div key={item} className="card-list-item">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-eyebrow">If the words won&apos;t come</div>
            <h3>Use the smaller tools.</h3>
            <p className="muted">
              Pause with the timer, bring the feeling to Cheshire, or pull a grounding move from the
              toolkit before you come back to the page.
            </p>
            <div className="inline-actions">
              <Link className="button ghost" href="/toolkit">
                Open toolkit
              </Link>
              <Link className="button ghost" href="/#cheshire">
                Talk to Cheshire
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
