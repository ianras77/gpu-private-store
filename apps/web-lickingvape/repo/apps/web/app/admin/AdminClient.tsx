'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { buildRasiesSearchHref, editorialPromptBank, searchSignals } from '../content';
import { publicApiBase } from '../lib/api';

type QueueItem = {
  id: number;
  source: string;
  body_raw: string;
  received_at: string;
  status: string;
  moderation_notes?: ModerationNotes;
};

type ModerationNotes = {
  decision?: string;
  status?: string;
  reasons?: string[];
  reason?: string;
};

const emptyNotes: ModerationNotes = { decision: '', status: '', reasons: [] };
const curatorRules = [
  'Keep the room sharp, human, and unspammy.',
  'Publish the honest version, not the sanitized version.',
  'Invite nicotine notes, life notes, and world notes when they are clearly lived.'
];

export default function AdminClient() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editedBody, setEditedBody] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const selected = useMemo(
    () => queue.find((item) => item.id === selectedId) || null,
    [queue, selectedId]
  );

  useEffect(() => {
    const stored = window.sessionStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
    }
  }, []);

  const fetchAdmin = useCallback(
    async (path: string, options: RequestInit = {}) => {
      if (!adminToken) {
        setAuthError('Admin token required.');
        return null;
      }
      const headers = new Headers(options.headers);
      headers.set('X-Admin-Token', adminToken);
      const res = await fetch(`${publicApiBase()}${path}`, { ...options, headers });
      if (res.status === 403) {
        setAuthError('Invalid admin token.');
        setAdminToken(null);
        setQueue([]);
        setSelectedId(null);
        setEditedBody('');
        setStatus(null);
        window.sessionStorage.removeItem('adminToken');
      }
      return res;
    },
    [adminToken]
  );

  const refreshQueue = useCallback(async () => {
    const res = await fetchAdmin('/admin/queue');
    if (!res || !res.ok) return;
    const data = await res.json();
    const items = data.queue || [];
    setQueue(items);
    if (!selectedId && items.length) {
      setSelectedId(items[0].id);
      setEditedBody(items[0].body_raw);
    }
  }, [selectedId, fetchAdmin]);

  useEffect(() => {
    if (adminToken) {
      refreshQueue();
    }
  }, [adminToken, refreshQueue]);

  useEffect(() => {
    if (selected) {
      setEditedBody(selected.body_raw);
    }
  }, [selected]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!queue.length) return;
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        const idx = queue.findIndex((item) => item.id === selectedId);
        const next = queue[Math.min(queue.length - 1, idx + 1)];
        setSelectedId(next.id);
        setEditedBody(next.body_raw);
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        const idx = queue.findIndex((item) => item.id === selectedId);
        const prev = queue[Math.max(0, idx - 1)];
        setSelectedId(prev.id);
        setEditedBody(prev.body_raw);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [queue, selectedId]);

  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextToken = tokenInput.trim();
    if (!nextToken) return;
    setAdminToken(nextToken);
    window.sessionStorage.setItem('adminToken', nextToken);
    setAuthError(null);
    setTokenInput('');
  };

  const lock = () => {
    setAdminToken(null);
    setQueue([]);
    setSelectedId(null);
    setEditedBody('');
    setStatus(null);
    setAuthError(null);
    window.sessionStorage.removeItem('adminToken');
  };

  const publish = async () => {
    if (!selected) return;
    setLoading(true);
    const res = await fetchAdmin(`/admin/publish/${selected.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: editedBody })
    });
    if (!res) {
      setLoading(false);
      return;
    }
    if (res.ok) {
      setStatus('Published to the feed.');
      await refreshQueue();
    } else {
      setStatus('Publish failed.');
    }
    setLoading(false);
  };

  const reject = async () => {
    if (!selected) return;
    setLoading(true);
    const res = await fetchAdmin(`/admin/reject/${selected.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Rejected by admin.' })
    });
    if (!res) {
      setLoading(false);
      return;
    }
    if (res.ok) {
      setStatus('Rejected.');
      await refreshQueue();
    } else {
      setStatus('Reject failed.');
    }
    setLoading(false);
  };

  if (!adminToken) {
    return (
      <section className="stack admin-shell">
        <div className="section-head">
          <h2>Night desk</h2>
          <p className="muted">
            Moderate the queue, seed editorial notes, and keep the room sounding like a real person
            stayed up late to care.
          </p>
        </div>
        {authError ? <div className="callout">{authError}</div> : null}
        <form onSubmit={unlock} className="card admin-login-card">
          <label htmlFor="admin-token">
            Admin token
            <input
              id="admin-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="Paste ADMIN_TOKEN"
            />
          </label>
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button type="submit" disabled={!tokenInput.trim()}>
              Unlock night desk
            </button>
          </div>
        </form>
        <div className="small">Set `ADMIN_TOKEN` in the API environment to enable admin auth.</div>
      </section>
    );
  }

  return (
    <section className="stack admin-shell">
      <div className="section-head">
        <h2>Night desk</h2>
        <p className="muted">Queue review, curated publishing, and current-world prompt seeding.</p>
      </div>

      <div className="card-grid admin-overview">
        <div className="card">
          <div className="card-eyebrow">Desk rules</div>
          <div className="card-list">
            {curatorRules.map((rule) => (
              <div key={rule} className="card-list-item">
                {rule}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-eyebrow">World prompt shelf</div>
          <div className="prompt-grid">
            {searchSignals.map((signal) => (
              <a
                key={signal.title}
                className="prompt-chip prompt-link"
                href={buildRasiesSearchHref(signal.query)}
                target="_blank"
                rel="noreferrer"
              >
                {signal.title}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="inline-actions admin-toolbar">
        <div className="small">Keyboard: `j` / `k` or arrows to move through the queue.</div>
        <button type="button" onClick={lock}>
          Lock Desk
        </button>
      </div>

      <div className="admin-grid">
        <div className="queue-list">
          {queue.map((item) => (
            <div
              key={item.id}
              className={`queue-item ${item.id === selectedId ? 'active' : ''}`}
              onClick={() => {
                setSelectedId(item.id);
                setEditedBody(item.body_raw);
              }}
            >
              <div className="small queue-meta">
                #{item.id} / {item.source} / {new Date(item.received_at).toLocaleString()}
              </div>
              <div style={{ marginTop: 8 }}>
                {item.body_raw.slice(0, 140)}
                {item.body_raw.length > 140 ? '...' : ''}
              </div>
            </div>
          ))}
          {!queue.length ? <div className="small">Queue empty.</div> : null}
        </div>

        <div className="card">
          {selected ? (
            <div className="stack">
              <div>
                <div className="card-eyebrow">Selected note</div>
                <label htmlFor="editor-body">
                  Editable note
                  <textarea
                    id="editor-body"
                    value={editedBody}
                    onChange={(event) => setEditedBody(event.target.value)}
                  />
                </label>
              </div>
              <div>
                <div className="card-eyebrow">LLM review</div>
                <div className="small">
                  {(() => {
                    const notes = selected.moderation_notes || emptyNotes;
                    const decision = notes.decision || notes.status || '';
                    const reasons = notes.reasons || notes.reason || [];
                    return (
                      <>
                        <div>{decision || 'pending'}</div>
                        {Array.isArray(reasons) && reasons.length ? (
                          <ul>
                            {reasons.map((reason: string, idx: number) => (
                              <li key={idx}>{reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="inline-actions">
                <button onClick={publish} disabled={loading || !editedBody.trim()}>
                  Publish Note
                </button>
                <button onClick={reject} disabled={loading}>
                  Reject Note
                </button>
                {status ? <span className="small">{status}</span> : null}
              </div>
            </div>
          ) : (
            <div className="small">Select a submission.</div>
          )}
        </div>
      </div>

      <div className="divider" />
      <EditorPanel fetchAdmin={fetchAdmin} />
    </section>
  );
}

function EditorPanel({
  fetchAdmin
}: {
  fetchAdmin: (path: string, options?: RequestInit) => Promise<Response | null>;
}) {
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState('draft');
  const [notice, setNotice] = useState<string | null>(null);

  const addSeed = (seed: string) => {
    setBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${seed}` : seed));
  };

  const submit = async () => {
    setNotice(null);
    const res = await fetchAdmin('/admin/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, status })
    });
    if (!res) {
      setNotice('Admin token required.');
      return;
    }
    if (res.ok) {
      setBody('');
      setNotice('Saved.');
    } else {
      setNotice('Save failed.');
    }
  };

  return (
    <section className="stack">
      <div className="section-head">
        <h3>Night editor</h3>
        <p className="muted">Draft original curator posts when the room needs a pulse.</p>
      </div>

      <div className="card">
        <div className="card-eyebrow">Prompt bank</div>
        <div className="prompt-grid">
          {editorialPromptBank.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              className="prompt-chip"
              onClick={() => addSeed(prompt.seed)}
            >
              {prompt.label}
            </button>
          ))}
        </div>
        <div className="small">Click a prompt to drop a seed into the editor.</div>
      </div>

      <div className="card">
        <div className="inline-actions">
          <button onClick={() => setPreview((prev) => !prev)}>
            {preview ? 'Edit' : 'Preview'}
          </button>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            style={{ maxWidth: 170 }}
          >
            <option value="draft">Draft</option>
            <option value="published">Publish now</option>
          </select>
        </div>
        {preview ? (
          <div className="preview-panel">
            <ReactMarkdown>{body || 'Nothing yet.'}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write the post the feed needs tonight."
          />
        )}
        <div className="inline-actions">
          <button onClick={submit} disabled={!body.trim()}>
            Save Draft
          </button>
          {notice ? <span className="small">{notice}</span> : null}
        </div>
      </div>
    </section>
  );
}
