'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  createRelationship,
  createSession,
  submitNeed,
  type InviteDeliveryChannel
} from '../lib/api';
import { hasStoredAuth } from '../lib/auth';
import { syncInviteDeliveryChannel } from '../lib/delivery';

const boundaryOptions = [
  'Respectful language only',
  'One issue at a time',
  'No pressure for instant decisions',
  'Pause if either person feels flooded'
];

const toneOptions = ['Soft landing', 'Clear and direct', 'Repair-first', 'Structured and calm'];
const deliveryOptions: Array<{
  value: InviteDeliveryChannel;
  label: string;
  detail: string;
}> = [
  {
    value: 'SMS_LINK',
    label: 'SMS link',
    detail: 'Best for text-first invites and phone numbers.'
  },
  {
    value: 'EMAIL_LINK',
    label: 'Email link',
    detail: 'Good for calmer long-form invites and email addresses.'
  },
  {
    value: 'IN_APP',
    label: 'In-app',
    detail: 'Use when the other person is already in the product. The room still gives you a link today.'
  },
  {
    value: 'IMESSAGE_HANDOFF',
    label: 'iMessage handoff',
    detail: 'Keeps the copy and link tuned for Messages while native send stays a later step.'
  }
];

function compressPreview(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'The mediator will help you say this gently and clearly.';
  }
  if (normalized.length <= 150) {
    return normalized;
  }
  return `${normalized.slice(0, 147).trimEnd()}...`;
}

export default function NewSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [topic, setTopic] = useState('Shared household cadence');
  const [relationshipType, setRelationshipType] = useState('Partner');
  const [desiredOutcome, setDesiredOutcome] = useState('A fair plan we both actually feel good about');
  const [need, setNeed] = useState(
    'I feel hurt and out of sync when decisions land after they are already made. I want us to have a small check-in before plans become final so I can feel included instead of informed after the fact.'
  );
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState<InviteDeliveryChannel>('SMS_LINK');
  const [tone, setTone] = useState(toneOptions[0] ?? 'Soft landing');
  const [boundaries, setBoundaries] = useState<string[]>([
    boundaryOptions[0] ?? 'Respectful language only',
    boundaryOptions[2] ?? 'No pressure for instant decisions'
  ]);
  const [customBoundary, setCustomBoundary] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAuth, setHasAuth] = useState(false);

  useEffect(() => {
    setHasAuth(hasStoredAuth());

    const emailParam = searchParams?.get('inviteeEmail');
    const nameParam = searchParams?.get('inviteeName');
    const deliveryParam = searchParams?.get('deliveryChannel');
    if (emailParam) {
      setInviteeEmail(emailParam);
      if (emailParam.includes('@')) {
        setDeliveryChannel('EMAIL_LINK');
      }
    }
    if (nameParam) {
      setInviteeName(nameParam);
    }
    if (
      deliveryParam === 'IN_APP' ||
      deliveryParam === 'SMS_LINK' ||
      deliveryParam === 'EMAIL_LINK' ||
      deliveryParam === 'IMESSAGE_HANDOFF'
    ) {
      setDeliveryChannel(deliveryParam);
    }
  }, [searchParams]);

  const previewSummary = useMemo(
    () => compressPreview(need),
    [need]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!hasAuth) {
      setError('Please create an account or sign in before opening a room.');
      return;
    }

    setStatus('Opening the room and drafting the first mediated invitation...');
    setLoading(true);

    try {
      const relationship = await createRelationship({ label: relationshipType });
      const session = await createSession({ relationshipId: relationship.id, topic });
      const response = await submitNeed({
        sessionId: session.id,
        content: need,
        relationshipType,
        desiredOutcome: `${desiredOutcome} (${tone})`,
        boundaries
      });

      if (!response.inviteDraft) {
        setError('The room paused for a safety review. Please soften the opening and try again.');
        setStatus(null);
        return;
      }

      sessionStorage.setItem('usmender.inviteDraft', JSON.stringify(response.inviteDraft));
      sessionStorage.setItem('usmender.sessionId', response.session.id);
      sessionStorage.setItem(
        'usmender.invitee',
        JSON.stringify({
          email: inviteeEmail,
          displayName: inviteeName,
          deliveryChannel
        })
      );

      const params = new URLSearchParams({ sessionId: response.session.id });
      if (inviteeEmail) {
        params.set('inviteeEmail', inviteeEmail);
      }
      if (inviteeName) {
        params.set('inviteeName', inviteeName);
      }
      params.set('deliveryChannel', deliveryChannel);

      router.push(`/sessions/preview?${params.toString()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      if (message.includes('Free plan limit reached')) {
        setError('Free plan limit reached. Upgrade or wait until next month to open another room.');
      } else {
        setError(message);
      }
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="composer-grid">
      <form className="card form" onSubmit={handleSubmit}>
        <div>
          <div className="pill">Step 1</div>
          <h2>Set up the room</h2>
          <p className="microcopy">
            Pick who this is with, what the issue is, and how much gentleness you want the
            mediator to bring to the opening.
          </p>
        </div>

        <div className="grid-two">
          <div>
            <label className="label" htmlFor="inviteeEmail">
              Person to invite
            </label>
            <input
              className="input"
              id="inviteeEmail"
              placeholder="Email or phone number"
              value={inviteeEmail}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setInviteeEmail(nextValue);
                setDeliveryChannel((current) => syncInviteDeliveryChannel(nextValue, current));
              }}
            />
            <div className="microcopy">
              Search from the inbox or type the email/phone you want this handoff to start from.
            </div>
          </div>
          <div>
            <label className="label" htmlFor="inviteeName">
              Their name
            </label>
            <input
              className="input"
              id="inviteeName"
              placeholder="Jordan"
              value={inviteeName}
              onChange={(event) => setInviteeName(event.currentTarget.value)}
            />
          </div>
        </div>

        <div className="grid-two">
          <div>
            <label className="label" htmlFor="topic">
              What is the room about?
            </label>
            <input
              className="input"
              id="topic"
              placeholder="Ex: feeling left out of decisions"
              value={topic}
              onChange={(event) => setTopic(event.currentTarget.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="relationship">
              Relationship
            </label>
            <input
              className="input"
              id="relationship"
              placeholder="Partner, roommate, parent, coworker"
              value={relationshipType}
              onChange={(event) => setRelationshipType(event.currentTarget.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">How should this handoff start?</label>
          <div className="chip-grid">
            {deliveryOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip-button ${deliveryChannel === option.value ? 'active' : ''}`}
                onClick={() => setDeliveryChannel(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="microcopy" style={{ marginTop: 10 }}>
            {deliveryOptions.find((option) => option.value === deliveryChannel)?.detail}
          </div>
          <div className="microcopy" style={{ marginTop: 6 }}>
            Email and SMS options auto-switch from the contact field. In-app and Messages stay
            locked when you choose them.
          </div>
        </div>

        <div>
          <label className="label" htmlFor="need">
            Your private first draft
          </label>
          <textarea
            className="textarea"
            id="need"
            placeholder="Write the honest version. The other person will not see this raw draft."
            rows={7}
            value={need}
            onChange={(event) => setNeed(event.currentTarget.value)}
          />
        </div>

        <div className="grid-two">
          <div>
            <label className="label" htmlFor="outcome">
              Best next outcome
            </label>
            <input
              className="input"
              id="outcome"
              placeholder="A clear, fair next step"
              value={desiredOutcome}
              onChange={(event) => setDesiredOutcome(event.currentTarget.value)}
            />
          </div>
          <div>
            <label className="label">Opening tone</label>
            <div className="chip-grid">
              {toneOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip-button ${tone === option ? 'active' : ''}`}
                  onClick={() => setTone(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="label">Mediator guardrails</label>
          <div className="chip-grid">
            {boundaryOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`chip-button ${boundaries.includes(option) ? 'active' : ''}`}
                onClick={() =>
                  setBoundaries((current) =>
                    current.includes(option)
                      ? current.filter((item) => item !== option)
                      : [...current, option]
                  )
                }
              >
                {option}
              </button>
            ))}
          </div>
          <div className="inline-row" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Add a custom guardrail"
              value={customBoundary}
              onChange={(event) => setCustomBoundary(event.currentTarget.value)}
            />
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                const trimmed = customBoundary.trim();
                if (!trimmed) return;
                setBoundaries((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
                setCustomBoundary('');
              }}
            >
              Add
            </button>
          </div>
        </div>

        <div className="cta-row">
          <button className="button primary" type="submit" disabled={loading || !hasAuth}>
            {loading ? 'Building room...' : 'Preview invitation'}
          </button>
          <Link className="button secondary" href="/dashboard">
            Back to inbox
          </Link>
        </div>

        {status && <div className="status">{status}</div>}
        {error && <div className="error">{error}</div>}
        {!hasAuth && (
          <div className="microcopy">
            You need an account before you can create or invite people into a live room.{' '}
            <Link href="/login">Sign in here.</Link>
          </div>
        )}
      </form>

      <div className="room-sidebar">
        <div className="composer-preview">
          <div className="pill">Step 2</div>
          <h3>What the mediator will do next</h3>
          <div className="timeline">
            <div className="timeline-item">
              <strong>Protect your raw draft</strong>
              <div className="microcopy">Only you and the mediator see your original message.</div>
            </div>
            <div className="timeline-item">
              <strong>Rewrite for safety and dignity</strong>
              <div className="microcopy">
                The opening will be softened into a respectful invitation to talk.
              </div>
            </div>
            <div className="timeline-item">
              <strong>Invite the other person in</strong>
              <div className="microcopy">
                Once they accept, both of you get guided questions inside the same room.
              </div>
            </div>
          </div>
        </div>

        <div className="card form">
          <div className="pill">Mediator preview</div>
          <h3>Likely opening summary</h3>
          <div className="preview">
            <div className="preview-label">Reframed summary</div>
            <div className="microcopy">{previewSummary}</div>
          </div>
          <div className="stat-callout">
            Tone: {tone}. Outcome: {desiredOutcome || 'A fair next step'}.
          </div>
          <ul className="meta-list">
            <li>Invite target: {inviteeName || inviteeEmail || 'You can add this on the next step.'}</li>
            <li>Handoff style: {deliveryOptions.find((option) => option.value === deliveryChannel)?.label}</li>
            <li>Relationship lens: {relationshipType || 'Relationship'}</li>
            <li>Guardrails active: {boundaries.length}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
