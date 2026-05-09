'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { acceptInvite, declineInvite, fetchInvite } from '../../../lib/api';
import { saveAuth } from '../../../lib/auth';

type InviteData = {
  token: string;
  status: string;
  inviteeEmailOrPhone: string;
  session: { id: string; topic: string; status: string };
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const tokenParam = params?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [email, setEmail] = useState('invitee@usmender.dev');
  const [displayName, setDisplayName] = useState('Jordan');
  const [password, setPassword] = useState('password123');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetchInvite(token)
      .then((data) => {
        setInvite(data);
        if (data.inviteeEmailOrPhone.includes('@')) {
          setEmail(data.inviteeEmailOrPhone);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Invite not found.'));
  }, [token]);

  async function handleAccept() {
    if (!token) return;
    setError(null);
    setStatus('Joining the room...');
    try {
      const response = await acceptInvite({ token, email, displayName, password });
      saveAuth({ token: response.token, user: response.user });
      router.push(`/sessions/${response.session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept invite.');
      setStatus(null);
    }
  }

  async function handleDecline() {
    if (!token) return;
    setError(null);
    setStatus('Declining invite...');
    try {
      await declineInvite(token);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to decline invite.');
      setStatus(null);
    }
  }

  return (
    <main>
      <section className="page-header">
        <div className="pill">Invitation</div>
        <h1>You have been invited into a warm, LLM-moderated conversation.</h1>
        <p className="microcopy">
          The other person does not send raw messages directly to you. The mediator helps both of
          you slow down, reframe, and work toward a kinder outcome.
        </p>
      </section>

      <section className="invite-layout">
        <div className="invite-preview">
          <div className="pill">About this room</div>
          <h2>{invite ? invite.session.topic : 'Loading room details...'}</h2>
          <div className="preview" style={{ marginTop: 12 }}>
            <div className="preview-label">What this means</div>
            <div className="microcopy">
              You are being invited into a guided conversation where the mediator sits between both
              people and helps translate conflict into something safer and easier to hear.
            </div>
          </div>
          <div className="timeline">
            <div className="timeline-item">
              <strong>Your consent matters</strong>
              <div className="microcopy">Nothing continues unless you choose to enter the room.</div>
            </div>
            <div className="timeline-item">
              <strong>You keep your dignity</strong>
              <div className="microcopy">
                The mediator filters heat and helps surface needs instead of blame.
              </div>
            </div>
            <div className="timeline-item">
              <strong>You can leave anytime</strong>
              <div className="microcopy">The goal is repair, not pressure.</div>
            </div>
          </div>
        </div>

        <div className="card form">
          <div className="pill">Enter the room</div>
          <h3>Create your access</h3>

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              className="input"
              id="email"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="displayName">
              Display name
            </label>
            <input
              className="input"
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              className="input"
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </div>

          <div className="cta-row">
            <button className="button primary" type="button" onClick={handleAccept}>
              Accept and join
            </button>
            <button className="button secondary" type="button" onClick={handleDecline}>
              Decline
            </button>
          </div>

          {status && <div className="status">{status}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      </section>
    </main>
  );
}
