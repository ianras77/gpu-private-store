'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  sendInvite,
  type InviteDeliveryChannel,
  type InviteDraft
} from '../../../lib/api';
import { syncInviteDeliveryChannel } from '../../../lib/delivery';

type StoredInvitee = {
  email?: string;
  displayName?: string;
  deliveryChannel?: InviteDeliveryChannel;
};

const deliveryLabels: Record<InviteDeliveryChannel, string> = {
  IN_APP: 'In-app',
  SMS_LINK: 'SMS link',
  EMAIL_LINK: 'Email link',
  IMESSAGE_HANDOFF: 'iMessage handoff'
};

export default function InvitePreviewClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [draft, setDraft] = useState<InviteDraft | null>(null);
  const [invitee, setInvitee] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState<InviteDeliveryChannel>('SMS_LINK');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  useEffect(() => {
    const paramSessionId = params?.get('sessionId');
    const emailParam = params?.get('inviteeEmail');
    const nameParam = params?.get('inviteeName');
    const channelParam = params?.get('deliveryChannel');

    if (paramSessionId) {
      setSessionId(paramSessionId);
    } else {
      const storedSessionId = sessionStorage.getItem('usmender.sessionId');
      if (storedSessionId) {
        setSessionId(storedSessionId);
      }
    }

    if (emailParam) {
      setInvitee(emailParam);
      if (emailParam.includes('@')) {
        setDeliveryChannel('EMAIL_LINK');
      }
    }

    if (nameParam) {
      setInviteeName(nameParam);
    }

    if (
      channelParam === 'IN_APP' ||
      channelParam === 'SMS_LINK' ||
      channelParam === 'EMAIL_LINK' ||
      channelParam === 'IMESSAGE_HANDOFF'
    ) {
      setDeliveryChannel(channelParam);
    }

    const storedInvitee = sessionStorage.getItem('usmender.invitee');
    if (storedInvitee && !emailParam && !nameParam) {
      try {
        const parsed = JSON.parse(storedInvitee) as StoredInvitee;
        if (parsed.email) setInvitee(parsed.email);
        if (parsed.displayName) setInviteeName(parsed.displayName);
        if (parsed.deliveryChannel) setDeliveryChannel(parsed.deliveryChannel);
      } catch {
        sessionStorage.removeItem('usmender.invitee');
      }
    }

    const storedDraft = sessionStorage.getItem('usmender.inviteDraft');
    if (storedDraft) {
      setDraft(JSON.parse(storedDraft) as InviteDraft);
    }
  }, [params]);

  const inviteLink = useMemo(() => {
    if (!inviteToken) return null;
    if (typeof window === 'undefined') return `/invites/${inviteToken}`;
    return `${window.location.origin}/invites/${inviteToken}`;
  }, [inviteToken]);

  async function handleSendInvite() {
    setError(null);
    setStatus('Sending the invitation into the room...');

    try {
      if (!sessionId) {
        throw new Error('Missing session id. Please rebuild the room.');
      }
      if (!invitee.trim()) {
        throw new Error('Add an email so the invitation has somewhere to go.');
      }

      const response = await sendInvite({
        sessionId,
        inviteeEmailOrPhone: invitee.trim(),
        deliveryChannel
      });

      setInviteToken(response.inviteToken);
      setDeliveryChannel(response.deliveryChannel);
      setStatus('Invitation created. You can copy the handoff link or move into the room.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send invite.');
      setStatus(null);
    }
  }

  async function handleCopyLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setStatus('Invite link copied.');
    } catch {
      setError('Copy failed. You can still use the link shown below.');
    }
  }

  return (
    <main>
      <section className="page-header">
        <div className="pill">Invitation preview</div>
        <h1>Approve the warm, neutral opening before it reaches the other person.</h1>
        <p className="microcopy">
          The mediator is translating your private draft into a respectful invitation to talk. You
          stay in control of the send.
        </p>
      </section>

      <section className="invite-layout">
        <div className="invite-preview">
          <div className="pill">Step 3</div>
          <h2>{draft?.subjectLine ?? 'Drafting your opening note...'}</h2>
          <div className="preview" style={{ marginTop: 12 }}>
            <div className="preview-label">What they will receive</div>
            <div className="microcopy">
              {draft?.inviteMessageNeutral ??
                'The room is preparing a softer, more balanced way to open the conversation.'}
            </div>
          </div>
          <div className="stat-callout">
            Summary of the issue: {draft?.issueSummaryNeutral ?? 'Generating a calm summary now.'}
          </div>
          <div className="timeline">
            <div className="timeline-item">
              <strong>Invite only</strong>
              <div className="microcopy">
                No raw feelings or accusations are shared in this first message.
              </div>
            </div>
            <div className="timeline-item">
              <strong>Consent first</strong>
              <div className="microcopy">
                The room only becomes active after the other person accepts.
              </div>
            </div>
            <div className="timeline-item">
              <strong>Guided responses</strong>
              <div className="microcopy">
                Once inside, both people answer mediator prompts instead of sending unfiltered text.
              </div>
            </div>
            <div className="timeline-item">
              <strong>Handoff style</strong>
              <div className="microcopy">
                This invite is currently using the {deliveryLabels[deliveryChannel]} path.
              </div>
            </div>
          </div>
        </div>

        <div className="card form">
          <div className="pill">Step 4</div>
          <h3>Send the invitation</h3>

          <div>
            <label className="label" htmlFor="invitee">
              Invitee email or phone
            </label>
            <input
              className="input"
              id="invitee"
              value={invitee}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setInvitee(nextValue);
                setDeliveryChannel((current) => syncInviteDeliveryChannel(nextValue, current));
              }}
              placeholder="person@email.com or +1 555..."
            />
          </div>

          <div>
            <label className="label" htmlFor="inviteeName">
              Their name
            </label>
            <input
              className="input"
              id="inviteeName"
              value={inviteeName}
              onChange={(event) => setInviteeName(event.currentTarget.value)}
              placeholder="Jordan"
            />
          </div>

          {inviteeName && (
            <div className="invite-chip">
              This invite will feel personal for {inviteeName}, while still staying neutral.
            </div>
          )}

          <div className="invite-chip">
            Handoff style: {deliveryLabels[deliveryChannel]}
          </div>

          <div className="cta-row">
            <button className="button primary" type="button" onClick={handleSendInvite}>
              Send invite
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => router.push(`/sessions/${sessionId || 'preview'}`)}
            >
              Open room
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => router.push('/sessions/new')}
            >
              Edit draft
            </button>
          </div>

          {status && <div className="status">{status}</div>}
          {error && <div className="error">{error}</div>}

          {inviteLink && (
            <div className="copy-box">
              <div className="preview-label">
                {deliveryChannel === 'SMS_LINK'
                  ? 'Link ready for SMS'
                  : deliveryChannel === 'IMESSAGE_HANDOFF'
                  ? 'Link ready for Messages'
                  : 'Invite link'}
              </div>
              <div className="microcopy">{inviteLink}</div>
              <div className="cta-row" style={{ marginTop: 12 }}>
                <button className="button secondary" type="button" onClick={handleCopyLink}>
                  {deliveryChannel === 'IMESSAGE_HANDOFF' ? 'Copy for Messages' : 'Copy link'}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => router.push(`/invites/${inviteToken}`)}
                >
                  Preview accept page
                </button>
              </div>
            </div>
          )}

          {!draft && (
            <div className="microcopy">
              If the draft is empty, return to the new room flow and rebuild the opening message.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
