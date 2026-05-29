'use client';

import { useState } from 'react';
import { publicApiBase } from './lib/api';
import type { Post } from './types';

function formatTimestamp(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatTag(tag: string) {
  return tag.replace(/-/g, ' ');
}

function formatSource(authorType: string) {
  if (authorType === 'admin') return 'night desk';
  if (authorType === 'sms') return 'text-in wall note';
  return 'wall note';
}

function mergeUniquePosts(current: Post[], incoming: Post[]): Post[] {
  const seen = new Set(current.map((post) => post.id));
  const uniqueIncoming = incoming.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  return [...current, ...uniqueIncoming];
}

export default function FeedClient({
  initialPosts,
  demoMode = false
}: {
  initialPosts: Post[];
  demoMode?: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    if (loading || done || demoMode) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${publicApiBase()}/posts?limit=20&offset=${posts.length}`);
      if (!res.ok) {
        throw new Error('Could not load more posts right now.');
      }

      const data = (await res.json()) as { posts?: Post[] };
      const next = Array.isArray(data.posts) ? data.posts : [];

      setPosts((prev) => mergeUniquePosts(prev, next));
      if (!next.length) {
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more posts right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="feed-shell anon-wall">
      {!posts.length ? (
        <div className="small">No wall notes yet. Be the first stripe on the page tonight.</div>
      ) : null}
      {demoMode ? (
        <div className="callout small">
          Demo wall notes are showing while the real archive wakes up.
        </div>
      ) : null}
      {posts.map((post) => (
        <article key={post.id} className="post">
          <div className="post-meta">
            <span>{formatTimestamp(post.published_at || post.created_at)}</span>
            <span className="post-source">{formatSource(post.author_type)}</span>
            <span className="post-byline">
              {post.display_name ? post.display_name : 'Anonymous'}
            </span>
          </div>
          <div className="post-body">{post.body}</div>
          <div className="post-rip" aria-hidden="true" />
          {post.tags && post.tags.length > 0 ? (
            <div className="post-tags">
              {post.tags.map((tag) => (
                <span key={tag} className="tag">
                  #{formatTag(tag)}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
      <div style={{ marginTop: 24 }} className="inline-actions feed-actions">
        <button onClick={loadMore} disabled={loading || done || demoMode}>
          {demoMode
            ? 'Connect the wall'
            : done
              ? 'Wall end'
              : loading
                ? 'Pulling notes...'
                : 'More notes'}
        </button>
        {error ? <span className="small status-error">{error}</span> : null}
      </div>
    </div>
  );
}
