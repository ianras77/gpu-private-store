'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchMe, fetchPlan, type MePayload, type PlanInfo } from '../../lib/api';
import { clearAuth, hasStoredAuth, readStoredUser } from '../../lib/auth';

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<MePayload | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(() => {
    const authed = hasStoredAuth();
    setHasAuth(authed);

    if (!authed) {
      const stored = readStoredUser();
      if (stored) {
        setMe({
          ...stored,
          createdAt: new Date().toISOString()
        });
      }
      return;
    }

    Promise.all([fetchMe(), fetchPlan()])
      .then(([profile, planResponse]) => {
        setMe(profile);
        setPlan(planResponse);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load settings.'));
  }, []);

  function handleSignOut() {
    clearAuth();
    router.push('/');
  }

  return (
    <main>
      <section className="page-header">
        <div className="pill">Trust settings</div>
        <h1>Keep the room kind, private, and under your control.</h1>
        <p className="microcopy">
          Settings are where the product explains its guardrails: safe summaries, consent,
          retention, and your current room limits.
        </p>
      </section>

      {!hasAuth && (
        <section className="auth-empty">
          <strong>Sign in to manage your real settings.</strong>
          <p className="microcopy">
            We can still show the product philosophy here, but your plan and profile load once you
            have an account.
          </p>
          <div className="cta-row" style={{ marginTop: 14 }}>
            <Link className="button primary" href="/login">
              Create account
            </Link>
          </div>
        </section>
      )}

      <section className="dashboard-grid">
        <div className="room-main">
          <div className="card form">
            <div className="pill">Moderation defaults</div>
            <div className="setting-row">
              <div>
                <strong>Safe summaries only</strong>
                <div className="microcopy">Raw messages are never passed directly across the room.</div>
              </div>
              <span className="toggle-pill">Always on</span>
            </div>
            <div className="setting-row">
              <div>
                <strong>Consent-first rooms</strong>
                <div className="microcopy">No active mediation until the invited person accepts.</div>
              </div>
              <span className="toggle-pill">Always on</span>
            </div>
            <div className="setting-row">
              <div>
                <strong>Safety pause</strong>
                <div className="microcopy">
                  The room stops forwarding messages when threat or coercion signals appear.
                </div>
              </div>
              <span className="toggle-pill">Always on</span>
            </div>
          </div>

          <div className="card">
            <div className="pill">Privacy notes</div>
            <ul className="meta-list" style={{ marginTop: 16 }}>
              <li>You can decide whether a message is worth sending after the mediator rewrites it.</li>
              <li>The other person sees neutral summaries, not your private emotional first draft.</li>
              <li>Rooms are structured around dignity, pacing, and concrete next steps.</li>
            </ul>
          </div>
        </div>

        <div className="room-sidebar">
          <div className="profile-card">
            <div className="pill">Profile</div>
            <h2>{me?.displayName ?? 'Your account'}</h2>
            <p className="microcopy">{me?.email ?? 'Sign in to load your profile details.'}</p>
            {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          </div>

          <div className="composer-preview">
            <div className="pill">Plan</div>
            <h3>{plan?.plan === 'PREMIUM' ? 'Premium' : 'Free tier'}</h3>
            <p className="microcopy">
              {plan
                ? plan.plan === 'PREMIUM'
                  ? `You have opened ${plan.sessionsThisMonth} rooms this month with unlimited access.`
                  : `You have opened ${plan.sessionsThisMonth} of ${plan.limit ?? 1} included rooms this month.`
                : 'Your usage loads here after sign-in.'}
            </p>
            <div className="cta-row" style={{ marginTop: 12 }}>
              <Link className="button secondary" href="/sessions/new">
                Start a room
              </Link>
              {plan?.upgradeAvailable && (
                <button className="button primary" type="button">
                  Upgrade soon
                </button>
              )}
            </div>
          </div>

          {hasAuth && (
            <div className="danger-card">
              <strong>Sign out of this device</strong>
              <p className="microcopy">
                Useful if you are borrowing a device or stepping away from a shared computer.
              </p>
              <div className="cta-row" style={{ marginTop: 14 }}>
                <button className="button secondary" type="button" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
