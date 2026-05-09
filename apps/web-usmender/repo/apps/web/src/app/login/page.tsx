'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login, signUp } from '../../lib/api';
import { saveAuth } from '../../lib/auth';

type AuthMode = 'signin' | 'signup';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('initiator@usmender.dev');
  const [password, setPassword] = useState('password123');
  const [displayName, setDisplayName] = useState('Avery Lane');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      if (mode === 'signin') {
        setStatus('Opening your mediation inbox...');
        const response = await login({ email, password });
        saveAuth(response);
        router.push('/dashboard');
        return;
      }

      setStatus('Creating your account...');
      const response = await signUp({ email, password, displayName });
      saveAuth(response);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue.');
      setStatus(null);
    }
  }

  return (
    <main>
      <section className="page-header">
        <div className="pill">Account access</div>
        <h1>Sign in or create an account to start mediated conversations.</h1>
        <p className="microcopy">
          The room is designed to feel warm and human while keeping every message grounded,
          moderated, and respectful.
        </p>
      </section>

      <section className="auth-layout">
        <form className="card form" onSubmit={handleSubmit}>
          <div className="auth-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => setMode('signup')}
            >
              Create account
            </button>
            <button
              type="button"
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => setMode('signin')}
            >
              Sign in
            </button>
          </div>

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              className="input"
              id="email"
              placeholder="you@usmender.com"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="label" htmlFor="displayName">
                Display name
              </label>
              <input
                className="input"
                id="displayName"
                placeholder="Avery Lane"
                value={displayName}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              className="input"
              id="password"
              placeholder="At least 8 characters"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </div>

          <div className="cta-row">
            <button className="button primary" type="submit">
              {mode === 'signup' ? 'Create account' : 'Open inbox'}
            </button>
            <Link className="button secondary" href="/">
              Back home
            </Link>
          </div>

          {status && <div className="status">{status}</div>}
          {error && <div className="error">{error}</div>}
        </form>

        <div className="composer-preview">
          <div className="pill">What happens next</div>
          <h2>Your room opens in four calm steps.</h2>
          <div className="timeline">
            {[
              ['1. Start with the truth', 'You write privately and the mediator sees the raw version.'],
              ['2. Approve the rewrite', 'The LLM reframes your message into something safe to send.'],
              ['3. Invite the other person', 'You can find existing users or send a neutral invite by email.'],
              ['4. Move toward a plan', 'Both sides share perspective before the room drafts a fair proposal.']
            ].map(([title, detail]) => (
              <div className="timeline-item" key={title}>
                <strong>{title}</strong>
                <div className="microcopy">{detail}</div>
              </div>
            ))}
          </div>
          <div className="stat-callout">
            Demo credentials are already filled in so you can explore the full flow right away.
          </div>
        </div>
      </section>
    </main>
  );
}
