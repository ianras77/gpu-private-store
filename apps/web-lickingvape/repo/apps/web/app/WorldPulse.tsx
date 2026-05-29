'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { buildRasiesSearchHref } from './content';
import { publicApiBase } from './lib/api';

const defaultSuggestions = [
  'nicotine cravings and doomscrolling',
  'how to stop vaping without shame',
  'today headlines and nervous system',
  'ritual replacement ideas'
];

type PulseItem = {
  title: string;
  url: string;
  snippet?: string | null;
  source?: string | null;
  engine?: string | null;
  published_at?: string | null;
};

type PulseQuery = {
  id: number;
  query: string;
  topic: string;
  angle: string;
  fetched_at: string;
  items: PulseItem[];
};

type PulsePost = {
  body?: string | null;
  display_name?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  status?: string | null;
  topic?: string | null;
  source_query?: string | null;
};

type WorldContext = {
  updated_at?: string | null;
  summary?: string | null;
  queries?: PulseQuery[];
  autopilot?: {
    last_post?: PulsePost | null;
  } | null;
};

type WorldPulseProps = {
  eyebrow?: string;
  title?: string;
  note?: string;
  suggestions?: string[];
  compact?: boolean;
};

export default function WorldPulse({
  eyebrow = 'World pulse',
  title = 'The den keeps one ear on the static for you.',
  note = 'Automatic ingest keeps the Scribe and the night desk current. Use search.rasies.com when you want to chase a specific thread yourself.',
  suggestions = defaultSuggestions,
  compact = false
}: WorldPulseProps) {
  const [query, setQuery] = useState('');
  const [pulse, setPulse] = useState<WorldContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const normalizedSuggestions = useMemo(
    () => suggestions.filter((item) => item && item.trim().length > 0),
    [suggestions]
  );
  const pulseQueries = (pulse?.queries || []).slice(0, compact ? 2 : 3);
  const pulseItemsPerLane = compact ? 2 : 3;
  const latestPost = pulse?.autopilot?.last_post || null;

  useEffect(() => {
    const controller = new AbortController();

    const loadPulse = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          limit_queries: compact ? '2' : '3',
          limit_items: compact ? '2' : '3'
        });
        const res = await fetch(`${publicApiBase()}/world/context?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error('Could not load the world pulse right now.');
        }

        const data = (await res.json()) as WorldContext;
        setPulse(data);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load the world pulse right now.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadPulse();

    return () => controller.abort();
  }, [compact, refreshTick]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    window.open(buildRasiesSearchHref(trimmed), '_blank', 'noopener,noreferrer');
  };

  const formatTimestamp = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: compact ? 'short' : 'medium'
    }).format(date);
  };

  const trimSnippet = (value?: string | null) => {
    const text = String(value || '').trim();
    const maxLength = compact ? 120 : 180;
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
  };

  return (
    <section className={`world-pulse ${compact ? 'compact' : ''}`}>
      <div className="world-pulse-head">
        <div>
          <div className="card-eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        <button
          type="button"
          className="button ghost world-pulse-refresh"
          onClick={() => setRefreshTick((value) => value + 1)}
          disabled={loading}
        >
          {loading ? 'Tuning Feed' : 'Refresh Pulse'}
        </button>
      </div>

      <div className="world-pulse-meta small">
        {pulse?.updated_at
          ? `Auto-ingest last synced ${formatTimestamp(pulse.updated_at)}.`
          : loading
            ? 'Tuning the radio for the latest pulse...'
            : 'No stored world pulse yet. The manual search lane is still open.'}
      </div>

      {pulse?.summary ? <div className="pulse-summary">{pulse.summary}</div> : null}
      {error ? <div className="small status-error">{error}</div> : null}

      {latestPost?.body ? (
        <article className="pulse-post">
          <div className="pulse-post-head">
            <div className="card-eyebrow">Last autopilot post</div>
            <div className="small">
              {latestPost.status || 'published'}
              {latestPost.published_at || latestPost.created_at
                ? ` | ${formatTimestamp(latestPost.published_at || latestPost.created_at)}`
                : ''}
            </div>
          </div>
          <div className="pulse-post-body">{latestPost.body}</div>
          <div className="pulse-post-meta small">
            {(latestPost.display_name || 'night desk') as string}
            {latestPost.topic ? ` | ${latestPost.topic}` : ''}
          </div>
        </article>
      ) : null}

      {pulseQueries.length ? (
        <div className="world-pulse-board">
          {pulseQueries.map((lane) => (
            <article key={lane.id} className="pulse-query-card">
              <div className="pulse-query-head">
                <div>
                  <div className="card-eyebrow">{lane.topic}</div>
                  <h4>{lane.query}</h4>
                </div>
                <a
                  className="prompt-link pulse-query-link"
                  href={buildRasiesSearchHref(lane.query)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open search
                </a>
              </div>
              <div className="pulse-query-meta small">{formatTimestamp(lane.fetched_at)}</div>
              <p className="muted pulse-query-angle">{lane.angle}</p>
              <div className="pulse-item-list">
                {lane.items.slice(0, pulseItemsPerLane).map((item) => (
                  <a
                    key={`${lane.id}-${item.url}`}
                    className="pulse-item"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="pulse-item-title">{item.title}</span>
                    <span className="pulse-item-meta">
                      {item.source || item.engine || 'source'}
                      {item.published_at ? ` | ${formatTimestamp(item.published_at)}` : ''}
                    </span>
                    {item.snippet ? (
                      <span className="small">{trimSnippet(item.snippet)}</span>
                    ) : null}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <form className="world-pulse-search" onSubmit={onSubmit}>
        <div className="card-eyebrow">Manual search lane</div>
        <div className="world-pulse-row">
          <label className="sr-only" htmlFor="world-pulse-query">
            Search query
          </label>
          <input
            id="world-pulse-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the headlines, the science, the weird little thing..."
          />
          <button type="submit" disabled={!query.trim()}>
            Search
          </button>
        </div>
        <div className="prompt-grid compact-grid">
          {normalizedSuggestions.map((item) => (
            <button key={item} type="button" className="prompt-chip" onClick={() => setQuery(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="small">{note}</div>
      </form>
    </section>
  );
}
