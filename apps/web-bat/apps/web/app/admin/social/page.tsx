"use client";

import { FormEvent, useEffect, useState } from "react";

import { apiBase, safeDate } from "@/lib/api";

type Social = {
  id: string;
  platform: string;
  status: string;
  body: string;
  thread_group?: string;
  created_at: string;
  published_at?: string;
  metadata?: Record<string, unknown>;
};

function scrubLabel(text: string): string {
  return text
    .replace(/\bcheshire\s+cat\b/gi, "editorial desk")
    .replace(/\bsatire\b/gi, "analysis")
    .replace(/\bcat\b/gi, "desk");
}

export default function AdminSocialPage() {
  const [rows, setRows] = useState<Social[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string>("");
  const [status, setStatus] = useState("");
  const [prompt, setPrompt] = useState("");
  const [intent, setIntent] = useState("response");
  const [publishNow, setPublishNow] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/social/posts`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Load failed (${response.status})`);
      }
      const data = (await response.json()) as Social[];
      setRows(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Load failed";
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const approvePost = async (postId: string) => {
    const response = await fetch(`${apiBase}/api/v1/social/posts/${postId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Approve failed (${response.status})`);
    }
  };

  const publishPost = async (row: Social) => {
    setPublishing(row.id);
    setStatus("");
    try {
      if (row.status !== "approved") {
        await approvePost(row.id);
      }
      const response = await fetch(`${apiBase}/api/v1/social/posts/${row.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Publish failed (${response.status})`);
      }
      setStatus(`Published ${row.id.slice(0, 8)}.`);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publish failed";
      setStatus(message);
    } finally {
      setPublishing("");
    }
  };

  const createLivePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) {
      setStatus("Add a prompt first.");
      return;
    }
    setCreating(true);
    setStatus("");
    try {
      const response = await fetch(`${apiBase}/api/v1/social/live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          intent: intent.trim() || "response",
          publish_now: publishNow,
          platform: "x",
        }),
      });
      if (!response.ok) {
        throw new Error(`Live post failed (${response.status})`);
      }
      setPrompt("");
      setStatus("Live post generated.");
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Live post failed";
      setStatus(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <section className="admin-hero">
        <div>
          <p className="admin-kicker">Social</p>
          <h1>Queen packaging studio</h1>
          <p className="admin-copy">
            Generate dispatches, quote cards, and thread pieces from the same editorial spine, then decide what actually leaves the room with polish and bite.
          </p>
        </div>
      </section>

      <form className="story-panel control-form" onSubmit={createLivePost}>
        <p className="section-kicker">Live short-form prompt</p>
        <div className="control-grid">
          <div>
            <label>
              <strong>Prompt</strong>
            </label>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={5}
              placeholder="React to this development in Queen voice..."
            />
          </div>

          <div>
            <label>
              <strong>Intent</strong>
            </label>
            <input value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="response | idea | reaction" />
            <label className="toggle-inline">
              <input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} />
              Publish immediately when it clears the gate
            </label>
          </div>
        </div>

        <div className="action-row">
          <button type="submit" disabled={creating}>
            {creating ? "Generating..." : "Generate live post"}
          </button>
          <button type="button" onClick={load} disabled={loading}>
            Refresh queue
          </button>
        </div>
        {status ? <p className="form-status">{status}</p> : null}
      </form>

      <section className="social-studio-grid">
        {loading ? (
          <p>Loading...</p>
        ) : rows.length ? (
          rows.map((row) => {
            const metadata = row.metadata ?? {};
            return (
              <article key={row.id} className="story-panel social-card">
                <p className="section-kicker">{scrubLabel(String(metadata.variant || metadata.hook_type || row.platform))}</p>
                <h3>{scrubLabel(String(metadata.slot || row.thread_group || "asset"))}</h3>
                <p>{scrubLabel(row.body)}</p>
                <div className="social-meta">
                  <span>{row.status}</span>
                  <span>{safeDate(row.created_at)}</span>
                  {row.published_at ? <span>{safeDate(row.published_at)}</span> : null}
                </div>
                {row.status !== "published" ? (
                  <button type="button" onClick={() => publishPost(row)} disabled={publishing === row.id}>
                    {publishing === row.id ? "Publishing..." : row.status === "approved" ? "Publish" : "Approve + publish"}
                  </button>
                ) : null}
              </article>
            );
          })
        ) : (
          <p>No social assets yet.</p>
        )}
      </section>
    </>
  );
}
