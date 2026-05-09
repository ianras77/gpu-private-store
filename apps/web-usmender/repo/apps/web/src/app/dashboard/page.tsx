'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  fetchMe,
  fetchPlan,
  listSessions,
  searchUsers,
  type MePayload,
  type PlanInfo,
  type SessionInboxItem,
  type UserSearchResult
} from '../../lib/api';
import { hasStoredAuth, readStoredUser } from '../../lib/auth';

function formatRelativeTime(value: string | null) {
  if (!value) return 'No activity yet';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const diffMs = new Date(value).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return formatter.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, 'day');
}

function mapStatus(status: string) {
  switch (status) {
    case 'INVITED':
      return 'Invite sent';
    case 'ACTIVE_INTAKE':
      return 'Hearing both sides';
    case 'VOTING_V1':
    case 'VOTING_V2':
      return 'Decision time';
    case 'PROPOSAL_V1':
    case 'PROPOSAL_V2':
      return 'Proposal ready';
    case 'AGREED':
      return 'Agreement reached';
    case 'ABORTED_SAFETY':
      return 'Safety pause';
    case 'CLOSED_NO_AGREEMENT':
      return 'Closed gently';
    default:
      return status.replaceAll('_', ' ').toLowerCase();
  }
}

function explainCue(session: SessionInboxItem) {
  if (session.cues.waitingOnMe) {
    if (session.cues.reason === 'invite') return 'Approve and send the invitation.';
    if (session.cues.reason === 'perspective') return 'Your mediator-approved message is needed next.';
    if (session.cues.reason === 'vote') return 'Your vote or feedback is needed now.';
    return 'This room needs your next move.';
  }

  if (session.cues.waitingOnOthers) {
    const names = session.cues.waitingOn.map((person) => person.displayName).join(', ');
    if (names) {
      return `Waiting on ${names}.`;
    }
    return 'Waiting on the other person.';
  }

  if (session.status === 'AGREED') {
    return 'You both landed on a shared plan.';
  }

  if (session.status === 'ABORTED_SAFETY') {
    return 'This room is paused to protect everyone involved.';
  }

  return 'The mediator is keeping the room in motion.';
}

function latestSnippet(session: SessionInboxItem) {
  return session.latestMessage?.snippet ?? 'The room is ready for its next step.';
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function DashboardPage() {
  const router = useRouter();
  const [hasAuth, setHasAuth] = useState(false);
  const [me, setMe] = useState<MePayload | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    const authed = hasStoredAuth();
    setHasAuth(authed);

    if (!authed) {
      setLoading(false);
      const stored = readStoredUser();
      if (stored) {
        setMe({
          ...stored,
          createdAt: new Date().toISOString()
        });
      }
      return;
    }

    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError(null);
      try {
        const [profile, sessionResponse, planResponse] = await Promise.all([
          fetchMe(),
          listSessions(),
          fetchPlan()
        ]);

        if (cancelled) return;
        setMe(profile);
        setSessions(sessionResponse.sessions);
        setPlan(planResponse);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to load the inbox.');
        const stored = readStoredUser();
        if (stored) {
          setMe({
            ...stored,
            createdAt: new Date().toISOString()
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasAuth) {
      setResults([]);
      setSearchError(null);
      return;
    }

    if (deferredQuery.length === 0) {
      setResults([]);
      setSearchError(null);
      return;
    }

    if (deferredQuery.length < 2) {
      setResults([]);
      setSearchError('Type at least two characters to find people.');
      return;
    }

    let cancelled = false;

    async function runSearch() {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const response = await searchUsers(deferredQuery);
        if (cancelled) return;
        setResults(response.results);
      } catch (err) {
        if (cancelled) return;
        setSearchError(err instanceof Error ? err.message : 'Unable to search right now.');
        setResults([]);
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }

    void runSearch();

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, hasAuth]);

  const stats = useMemo(() => {
    const active = sessions.filter(
      (session) => !['AGREED', 'CLOSED_NO_AGREEMENT', 'ABORTED_SAFETY'].includes(session.status)
    ).length;
    const needsMe = sessions.filter((session) => session.cues.waitingOnMe).length;
    const unread = sessions.filter((session) => session.cues.unread).length;

    return { active, needsMe, unread };
  }, [sessions]);

  function openNewRoom(user?: UserSearchResult) {
    const params = new URLSearchParams();
    if (user) {
      params.set('inviteeEmail', user.email);
      params.set('inviteeName', user.displayName);
      params.set('deliveryChannel', 'IN_APP');
    }

    const href = params.toString() ? `/sessions/new?${params.toString()}` : '/sessions/new';
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <main>
      <section className="page-header inbox-hero">
        <div className="pill">Mediation inbox</div>
        <h1>{me ? `${me.displayName}, here is what the room needs today.` : 'A calmer way to work through conflict.'}</h1>
        <p className="microcopy">
          Search for people, invite them into a guided conversation, and let the mediator help
          both sides move from heat toward clarity.
        </p>
        {hasAuth && (
          <div className="badge-row">
            <span className="invite-chip">Mobile-first and ready for iOS shelling</span>
            <span className="invite-chip">LLM moderation sits between every reply</span>
          </div>
        )}
      </section>

      {!hasAuth && (
        <section className="auth-empty">
          <strong>Sign in to open the real product flow.</strong>
          <p className="microcopy">
            Your inbox, people search, invitations, and live mediation rooms unlock once you
            create an account.
          </p>
          <div className="cta-row" style={{ marginTop: 14 }}>
            <Link className="button primary" href="/login">
              Create account
            </Link>
            <Link className="button secondary" href="/">
              Learn how it works
            </Link>
          </div>
        </section>
      )}

      {hasAuth && (
        <>
          <section className="action-grid">
            <div className="action-card">
              <strong>Start a new mediation room</strong>
              <div className="microcopy">
                Invite someone in by email, set the emotional guardrails, and let the mediator
                draft the opening tone.
              </div>
              <button className="button primary" type="button" onClick={() => openNewRoom()}>
                New room
              </button>
            </div>
            <div className="action-card">
              <strong>Practice a repair before you send</strong>
              <div className="microcopy">
                Use the daily reflection flow to soften a hard conversation before it becomes a room.
              </div>
              <Link className="button secondary" href="/daily">
                Open daily repair
              </Link>
            </div>
            <div className="action-card">
              <strong>Trust and moderation settings</strong>
              <div className="microcopy">
                Review privacy, plan limits, and the safeguards that keep the room kind.
              </div>
              <Link className="button secondary" href="/settings">
                Open settings
              </Link>
            </div>
          </section>

          <section className="dashboard-grid">
            <div className="room-main">
              <div className="card">
                <div className="lane-header">
                  <div>
                    <div className="pill">Your rooms</div>
                    <h2>Moderated conversations in motion</h2>
                  </div>
                  <div className="badge-row">
                    <span className="invite-chip">{stats.active} active</span>
                    <span className="invite-chip">{stats.needsMe} need you</span>
                    <span className="invite-chip">{stats.unread} unread cues</span>
                  </div>
                </div>

                {loading && <div className="status">Loading your inbox...</div>}
                {error && <div className="error">{error}</div>}

                {!loading && !sessions.length && !error && (
                  <div className="empty-state">
                    <strong>Your mediation inbox is empty.</strong>
                    <p className="microcopy">
                      Start the first room, invite another person in, and let the mediator set the tone.
                    </p>
                    <div className="cta-row" style={{ marginTop: 14 }}>
                      <button className="button primary" type="button" onClick={() => openNewRoom()}>
                        Open first room
                      </button>
                    </div>
                  </div>
                )}

                <div className="session-list">
                  {sessions.map((session) => (
                    <Link
                      className={`session-row ${session.cues.unread ? 'unread' : ''}`}
                      key={session.id}
                      href={`/sessions/${session.id}`}
                    >
                      <div className="session-row-leading">
                        <div className="session-avatar-stack" aria-hidden="true">
                          {session.participants.slice(0, 2).map((participant, index) => (
                            <span
                              className={`session-avatar ${index === 1 ? 'offset' : ''}`}
                              key={`${session.id}-${participant.id}`}
                            >
                              {initialsForName(participant.displayName)}
                            </span>
                          ))}
                          {session.cues.unread && <span className="session-unread-dot" />}
                        </div>
                        <div className="session-row-copy">
                          <div className="session-row-header">
                            <div>
                              <h3>{session.topic}</h3>
                              <div className="session-row-subtitle">
                                {session.participants.map((participant) => participant.displayName).join(' • ')}
                              </div>
                            </div>
                            <div className="session-row-trailing">
                              <span className="session-time">{formatRelativeTime(session.lastActivityAt)}</span>
                            </div>
                          </div>

                          <div className="session-row-footer">
                            <div className="session-status-line">
                              <span className="room-status-badge">{mapStatus(session.status)}</span>
                              <div className="session-snippet">{latestSnippet(session)}</div>
                            </div>
                            <div className="badge-row">
                              {session.cues.unread && <span className="signal-pill">Unread</span>}
                              {session.cues.waitingOnMe && <span className="signal-pill">Your turn</span>}
                              {session.invite && session.status === 'INVITED' && (
                                <span className="signal-pill">Invite open</span>
                              )}
                            </div>
                          </div>

                          <div className="session-row-meta">{explainCue(session)}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <section className="journey">
                <div className="section-label">Why this feels different</div>
                <h2>The mediator sits between the feeling and the send button.</h2>
                <div className="journey-grid">
                  {[
                    ['Private truth', 'Say the unedited thing in a safe draft space.'],
                    ['Approval step', 'Review the softer, fairer rewrite before it goes out.'],
                    ['Perspective bridge', 'The LLM coaches each side to see the issue beneath the heat.'],
                    ['Shared plan', 'The room closes with a proposal both people can accept or revise.']
                  ].map(([title, detail]) => (
                    <div className="journey-card" key={title}>
                      <strong>{title}</strong>
                      <div className="microcopy">{detail}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="room-sidebar">
              <div className="card form">
                <div>
                  <div className="pill">Find people</div>
                  <h2>Invite another user into a room</h2>
                </div>
                <div className="microcopy">
                  Search by name or email. If they already have an account, you can jump straight
                  into a new mediation room with them.
                </div>
                <div>
                  <label className="label" htmlFor="people-search">
                    Search users
                  </label>
                  <input
                    className="input"
                    id="people-search"
                    placeholder="Search by name or email"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                  />
                </div>

                {searchLoading && <div className="status">Looking for people...</div>}
                {searchError && <div className="error">{searchError}</div>}

                <div className="search-results">
                  {results.map((user) => (
                    <div className="search-row" key={user.id}>
                      <div className="search-avatar" aria-hidden="true">
                        {initialsForName(user.displayName)}
                      </div>
                      <div className="search-row-meta">
                        <strong>{user.displayName}</strong>
                        <div className="search-hint">{user.email}</div>
                      </div>
                      <button className="button secondary" type="button" onClick={() => openNewRoom(user)}>
                        Invite
                      </button>
                    </div>
                  ))}

                  {!searchLoading && deferredQuery.length >= 2 && !results.length && !searchError && (
                    <div className="empty-state">
                      <strong>No matching users yet.</strong>
                      <div className="microcopy">
                        You can still start a room manually and invite them by email.
                      </div>
                      <div className="cta-row" style={{ marginTop: 12 }}>
                        <button className="button secondary" type="button" onClick={() => openNewRoom()}>
                          Invite by email
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="composer-preview">
                <div className="pill">Plan + pacing</div>
                <h3>{plan?.plan === 'PREMIUM' ? 'Premium room flow' : 'Starter room flow'}</h3>
                <p className="microcopy">
                  {plan
                    ? plan.plan === 'PREMIUM'
                      ? `You have created ${plan.sessionsThisMonth} rooms this month with unlimited capacity.`
                      : `You have used ${plan.sessionsThisMonth} of ${plan.limit ?? 1} included rooms this month.`
                    : 'We load your usage and plan details here as soon as the inbox is ready.'}
                </p>
                <ul className="meta-list">
                  <li>Every room begins with consent and invitation.</li>
                  <li>The mediator rewrites messages before the other person sees them.</li>
                  <li>Each conversation ends with a shared proposal or a respectful pause.</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
