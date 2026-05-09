'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createSessionStream,
  fetchSessionRoom,
  generateProposal,
  markSessionRead,
  previewMediatedMessage,
  sendMediatedMessage,
  submitVote,
  type MessagePreview,
  type RoomPayload
} from '../../../lib/api';

type VoteValue = 'YES' | 'NO' | 'NEEDS_CHANGES';

type FeedItem = {
  id: string;
  mode: 'mediator' | 'self' | 'other';
  title: string;
  content: string;
  createdAt: string;
  timelineOrder: number;
  deliveryLabel?: string | null;
  deliveryError?: string | null;
};

const stageDefinitions = [
  { label: 'Invite', detail: 'Set the tone and ask for consent.' },
  { label: 'Hear both sides', detail: 'Each person writes privately first.' },
  { label: 'Reframe', detail: 'The mediator translates heat into clarity.' },
  { label: 'Draft a plan', detail: 'A proposal appears once both sides are heard.' },
  { label: 'Decide together', detail: 'Vote, revise, or land on an agreement.' }
];

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function stageIndexFor(status: string) {
  switch (status) {
    case 'DRAFT':
    case 'INVITE_READY':
    case 'INVITED':
      return 0;
    case 'ACTIVE_INTAKE':
      return 1;
    case 'PROPOSAL_V1':
      return 3;
    case 'VOTING_V1':
    case 'REFINEMENT':
    case 'PROPOSAL_V2':
      return 4;
    case 'VOTING_V2':
    case 'AGREED':
    case 'CLOSED_NO_AGREEMENT':
    case 'ABORTED_SAFETY':
      return 4;
    default:
      return 1;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'INVITED':
      return 'Invite sent';
    case 'ACTIVE_INTAKE':
      return 'Guided intake';
    case 'PROPOSAL_V1':
    case 'PROPOSAL_V2':
      return 'Proposal drafted';
    case 'VOTING_V1':
    case 'VOTING_V2':
      return 'Voting live';
    case 'AGREED':
      return 'Agreement reached';
    case 'ABORTED_SAFETY':
      return 'Safety pause';
    case 'CLOSED_NO_AGREEMENT':
      return 'Closed without agreement';
    default:
      return status.replaceAll('_', ' ').toLowerCase();
  }
}

function helperCopy(room: RoomPayload) {
  if (room.session.status === 'ABORTED_SAFETY') {
    return 'The room is paused. No new messages will be forwarded until the safety issue is resolved.';
  }

  if (room.session.status.startsWith('VOTING')) {
    return 'The mediator has drafted a proposal. You can still send a mediated clarification before you vote.';
  }

  if (room.proposal) {
    return 'A proposal is on the table. Use the room to react calmly, then move into a decision.';
  }

  if (room.intake.complete) {
    return 'Both sides have been heard. You can ask the mediator to draft a plan.';
  }

  return 'Write the raw version privately. The mediator will rewrite it before it reaches the other person.';
}

function isPreviewFresh(
  preview: MessagePreview | null,
  note: string,
  approvalToken: string | null,
  roomRevision: number | null
) {
  if (!preview) return false;
  return (
    preview.rawText.trim() === note.trim() &&
    preview.sessionRevision === roomRevision &&
    Boolean(approvalToken)
  );
}

function deliveryLabel(status: string | undefined) {
  if (!status) return null;

  switch (status) {
    case 'READ':
      return 'Seen by the other person';
    case 'WAITING_FOR_PARTICIPANT':
      return 'Waiting for them to join the room';
    case 'AVAILABLE':
    case 'DELIVERED':
    case 'SENT':
    case 'SIMULATED':
      return 'In the shared room';
    case 'FAILED':
      return 'Delivery issue';
    default:
      return 'In the shared room';
  }
}

function presenceCopy(lastSeenAt: string | null | undefined, isMe: boolean) {
  if (!lastSeenAt) {
    return isMe ? 'You have not opened this room yet.' : 'Not in the room yet.';
  }

  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  if (ageMs < 45_000) {
    return isMe ? 'You are here now.' : 'Viewing now.';
  }

  if (ageMs < 5 * 60_000) {
    const minutes = Math.max(1, Math.round(ageMs / 60_000));
    return isMe ? `You were here ${minutes}m ago.` : `Active ${minutes}m ago.`;
  }

  return isMe ? `You last viewed this room ${formatTimestamp(lastSeenAt)}.` : `Last here ${formatTimestamp(lastSeenAt)}.`;
}

function inviteStatusCopy(room: RoomPayload) {
  if (!room.invite) {
    return null;
  }

  switch (room.invite.status) {
    case 'ACCEPTED':
      return 'Both people can use the in-app room now.';
    case 'DECLINED':
      return 'The invite was declined.';
    case 'EXPIRED':
      return 'The invite link expired before it was accepted.';
    case 'OPENED':
      return 'The invite was opened and is waiting for acceptance.';
    default:
      return 'Waiting for the other person to join the room.';
  }
}

export default function SessionRoomPage() {
  const params = useParams();
  const idParam = params?.id;
  const sessionId = Array.isArray(idParam) ? (idParam[0] ?? '') : (idParam ?? '');
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [note, setNote] = useState('');
  const [voteComment, setVoteComment] = useState('');
  const [messagePreview, setMessagePreview] = useState<MessagePreview | null>(null);
  const [messageApprovalToken, setMessageApprovalToken] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSafetyFlag, setPreviewSafetyFlag] = useState<{
    flagged: boolean;
    reason?: string;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [streamStatus, setStreamStatus] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>(
    'connecting'
  );
  const lastAcknowledgedRevisionRef = useRef<number | null>(null);
  const lastPresencePingAtRef = useRef(0);

  useEffect(() => {
    const activeSessionId = sessionId;
    if (!activeSessionId) return;
    lastAcknowledgedRevisionRef.current = null;
    lastPresencePingAtRef.current = 0;
    let cancelled = false;
    let stream: EventSource | null = null;
    let reconnectTimeoutId: number | null = null;
    let latestRevision: number | undefined;

    async function acknowledgeRead(
      revision: number | undefined,
      options?: { force?: boolean; suppressError?: boolean }
    ) {
      if (revision === undefined) {
        return;
      }

      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();
      const shouldSkipRevision =
        !options?.force && lastAcknowledgedRevisionRef.current === revision;
      const shouldSkipPresencePing =
        options?.force &&
        lastAcknowledgedRevisionRef.current === revision &&
        now - lastPresencePingAtRef.current < 20_000;

      if (shouldSkipRevision || shouldSkipPresencePing) {
        return;
      }

      try {
        await markSessionRead({ sessionId: activeSessionId, revision });
        lastAcknowledgedRevisionRef.current = revision;
        lastPresencePingAtRef.current = now;
      } catch (err) {
        if (!cancelled && !options?.suppressError) {
          setError(err instanceof Error ? err.message : 'Unable to confirm room read state.');
        }
      }
    }

    async function loadRoom(silent = false) {
      if (!silent) {
        setError(null);
      }

      try {
        const nextRoom = await fetchSessionRoom(activeSessionId);
        if (!cancelled) {
          latestRevision = nextRoom.session.revision;
          setRoom(nextRoom);
          void acknowledgeRead(nextRoom.session.revision, { suppressError: true });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load this room.');
        }
      }
    }

    async function connectStream() {
      if (cancelled) return;
      setStreamStatus((current) => (current === 'live' ? 'reconnecting' : 'connecting'));

      try {
        const nextStream = await createSessionStream(activeSessionId);
        if (cancelled) {
          nextStream.close();
          return;
        }

        stream = nextStream;
        stream.addEventListener('room', (event) => {
          if (cancelled) return;
          try {
            const nextRoom = JSON.parse(event.data) as RoomPayload;
            latestRevision = nextRoom.session.revision;
            setRoom(nextRoom);
            setStreamStatus('live');
            void acknowledgeRead(nextRoom.session.revision, { suppressError: true });
          } catch {
            setError('Live room updates became unreadable. Reconnecting...');
          }
        });
        stream.addEventListener('room_error', (event) => {
          if (cancelled) return;
          try {
            const payload = JSON.parse(event.data) as { error?: string };
            setError(payload.error ?? 'Live room updates reported a problem.');
          } catch {
            setError('Live room updates reported a problem.');
          }
        });
        stream.onerror = () => {
          if (cancelled) return;
          setStreamStatus('reconnecting');
          stream?.close();
          stream = null;
          if (reconnectTimeoutId === null) {
            reconnectTimeoutId = window.setTimeout(() => {
              reconnectTimeoutId = null;
              void connectStream();
            }, 2000);
          }
        };
      } catch (err) {
        if (!cancelled) {
          setStreamStatus('offline');
          setError(err instanceof Error ? err.message : 'Unable to open live room updates.');
          reconnectTimeoutId = window.setTimeout(() => {
            reconnectTimeoutId = null;
            void connectStream();
          }, 3000);
        }
      }
    }

    void loadRoom();
    void connectStream();
    const interval = window.setInterval(() => {
      void loadRoom(true);
    }, 45000);
    const heartbeat = window.setInterval(() => {
      void acknowledgeRead(lastAcknowledgedRevisionRef.current ?? undefined, {
        force: true,
        suppressError: true
      });
    }, 25000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void acknowledgeRead(latestRevision, { suppressError: true });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      stream?.close();
      if (reconnectTimeoutId !== null) {
        window.clearTimeout(reconnectTimeoutId);
      }
      window.clearInterval(interval);
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId]);

  const combinedFeed = useMemo<FeedItem[]>(() => {
    if (!room) return [];

    const shared = room.messages.shared.map((message) => ({
      id: message.id,
      mode: message.authorUserId === room.me.id ? ('self' as const) : ('other' as const),
      title:
        message.authorUserId === room.me.id
          ? 'You, after mediator approval'
          : room.participants.find((participant) => participant.id === message.authorUserId)?.displayName ??
            'Other person',
      content: message.content,
      createdAt: message.createdAt,
      timelineOrder: message.timelineOrder,
      deliveryLabel:
        message.authorUserId === room.me.id ? deliveryLabel(message.delivery?.status) : null,
      deliveryError:
        message.authorUserId === room.me.id ? message.delivery?.lastError ?? null : null
    }));

    const system = room.messages.system.map((message) => ({
      id: message.id,
      mode: 'mediator' as const,
      title:
        message.kind === 'CAT_QUESTION'
          ? 'Mediator prompt'
          : message.kind === 'CAT_PROPOSAL'
          ? 'Mediator proposal'
          : 'Mediator note',
      content: message.content,
      createdAt: message.createdAt,
      timelineOrder: message.timelineOrder,
      deliveryLabel: null,
      deliveryError: null
    }));

    return [...shared, ...system].sort((left, right) => {
      const orderDelta = left.timelineOrder - right.timelineOrder;
      if (orderDelta !== 0) {
        return orderDelta;
      }

      const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.id.localeCompare(right.id);
    });
  }, [room]);

  const myVote = useMemo(() => {
    if (!room?.proposal) return null;
    return room.proposal.votes.find((vote) => vote.userId === room.me.id) ?? null;
  }, [room]);

  const activeStage = room ? stageIndexFor(room.session.status) : 0;
  const waitingNames =
    room?.intake.waitingOn
      .filter((participant) => participant.id !== room.me.id)
      .map((participant) => participant.displayName)
      .join(', ') ?? '';
  const previewReady = isPreviewFresh(
    messagePreview,
    note,
    messageApprovalToken,
    room?.session.revision ?? null
  );
  const previewStale =
    Boolean(messagePreview) && messagePreview?.sessionRevision !== (room?.session.revision ?? null);

  useEffect(() => {
    if (!sessionId || !room?.capabilities.canCompose) {
      setMessagePreview(null);
      setMessageApprovalToken(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setPreviewSafetyFlag(null);
      return;
    }

    const trimmed = note.trim();
    if (trimmed.length < 2) {
      setMessagePreview(null);
      setMessageApprovalToken(null);
      setPreviewError(null);
      setPreviewLoading(false);
      setPreviewSafetyFlag(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);

      try {
        const response = await previewMediatedMessage({ sessionId, content: trimmed });
        if (cancelled) return;
        setMessagePreview(response.preview);
        setMessageApprovalToken(response.approvalToken);
        setPreviewSafetyFlag(response.safetyFlag);
      } catch (err) {
        if (cancelled) return;
        setPreviewError(err instanceof Error ? err.message : 'Unable to preview your message.');
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }, 550);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [note, room?.capabilities.canCompose, room?.session.revision, sessionId]);

  async function handleSendMessage() {
    if (!sessionId || !note.trim() || sendingMessage) return;
    setError(null);
    setSendingMessage(true);

    const trimmedNote = note.trim();
    let previewToSend = messagePreview;
    let approvalTokenToSend = messageApprovalToken;

    try {
      if (
        !isPreviewFresh(previewToSend, trimmedNote, approvalTokenToSend, room?.session.revision ?? null) ||
        previewSafetyFlag?.flagged
      ) {
        setStatus('Refreshing the mediator preview before sending...');
        const response = await previewMediatedMessage({ sessionId, content: trimmedNote });
        setMessagePreview(response.preview);
        setMessageApprovalToken(response.approvalToken);
        setPreviewSafetyFlag(response.safetyFlag);
        previewToSend = response.preview;
        approvalTokenToSend = response.approvalToken;
        if (response.safetyFlag.flagged) {
          setStatus(null);
          return;
        }
      }

      setStatus('Sending the approved mediated message...');

      if (!previewToSend || !approvalTokenToSend) {
        throw new Error('The mediator preview expired. Refresh and try again.');
      }

      const updated = await sendMediatedMessage({
        sessionId,
        content: trimmedNote,
        previewId: previewToSend.previewId,
        approvalToken: approvalTokenToSend,
        clientMessageId: previewToSend.previewId
      });
      setRoom(updated);
      setNote('');
      setMessagePreview(null);
      setMessageApprovalToken(null);
      setPreviewSafetyFlag(null);
      setPreviewError(null);
      setStatus('Approved and added to the moderated channel.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete that send.');
      setStatus(null);
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleGenerateProposal() {
    if (!sessionId) return;
    setError(null);
    setStatus('Drafting a proposal...');
    try {
      const updated = await generateProposal(sessionId);
      setRoom(updated);
      setStatus('The mediator drafted a proposal for both of you to review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to draft a proposal.');
      setStatus(null);
    }
  }

  async function handleVote(value: VoteValue) {
    if (!sessionId) return;
    setError(null);
    setStatus('Recording your decision...');

    try {
      const payload: { sessionId: string; value: VoteValue; comment?: string } = {
        sessionId,
        value
      };
      const trimmedComment = voteComment.trim();
      if (trimmedComment) {
        payload.comment = trimmedComment;
      }
      const updated = await submitVote(payload);
      setRoom(updated);
      setStatus('Your vote has been shared with the mediator.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record your vote.');
      setStatus(null);
    }
  }

  if (!room) {
    return (
      <main>
        <section className="page-header">
          <div className="pill">Mediation room</div>
          <h1>Loading the conversation...</h1>
          <p className="microcopy">
            Pulling in your private drafts, the moderated channel, and the current room status.
          </p>
        </section>
        {error && <div className="error">{error}</div>}
      </main>
    );
  }

  return (
    <main>
      <section className="page-header thread-header">
        <div className="pill">Moderated room</div>
        <h1>{room.session.topic}</h1>
        <div className="thread-hero-meta">
          <div className="session-avatar-stack large" aria-hidden="true">
            {room.participants.slice(0, 2).map((participant, index) => (
              <span
                className={`session-avatar ${index === 1 ? 'offset' : ''}`}
                key={`hero-${participant.id}`}
              >
                {initialsForName(participant.displayName)}
              </span>
            ))}
          </div>
          <div className="thread-participant-copy">
            <strong>{room.participants.map((participant) => participant.displayName).join(' • ')}</strong>
            <div className="microcopy">
              A live in-app conversation where every shared reply is mediated first.
            </div>
          </div>
        </div>
        <div className="badge-row">
          <span className="invite-chip">{statusLabel(room.session.status)}</span>
          {waitingNames && <span className="invite-chip">Waiting on {waitingNames}</span>}
          <span className="invite-chip">
            {streamStatus === 'live'
              ? 'Live updates on'
              : streamStatus === 'reconnecting'
              ? 'Reconnecting...'
              : streamStatus === 'offline'
              ? 'Live updates offline'
              : 'Connecting...'}
          </span>
        </div>
        <p className="microcopy">{helperCopy(room)}</p>
      </section>

      <section className="room-grid">
        <div className="room-main">
          <div className="card thread-card">
            <div className="lane-header">
              <div>
                <div className="pill">Shared channel</div>
                <h2>The conversation everyone can see</h2>
              </div>
              <Link className="button secondary" href="/dashboard">
                Back to inbox
              </Link>
            </div>

            <div className="thread-window">
              <div className="chat-feed">
                {combinedFeed.length === 0 && (
                  <div className="empty-state">
                    <strong>The channel is still quiet.</strong>
                    <div className="microcopy">
                      Start with a private draft below and let the mediator open the conversation.
                    </div>
                  </div>
                )}

                {combinedFeed.map((item) => (
                  <div className={`chat-item ${item.mode}`} key={item.id}>
                    <div className="chat-author">{item.title}</div>
                    <div className={`chat-bubble ${item.mode}`}>{item.content}</div>
                    {item.deliveryLabel && <div className="microcopy">{item.deliveryLabel}</div>}
                    {item.deliveryError && <div className="microcopy">{item.deliveryError}</div>}
                    <div className="chat-time">{formatTimestamp(item.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card form composer-card">
            <div className="lane-header">
              <div>
                <div className="pill">Message composer</div>
                <h2>Type naturally. The mediator integrates into the send flow.</h2>
              </div>
              <span className="tag">Private until approved</span>
            </div>

            <div className="microcopy">
              This should feel like messaging, not paperwork. You type privately, the mediator
              shapes it inline, and you approve the exact version that enters the shared thread.
            </div>

            <textarea
              className="textarea"
              id="note"
              rows={6}
              value={note}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setNote(nextValue);
                if (messagePreview && messagePreview.rawText.trim() !== nextValue.trim()) {
                  setMessagePreview(null);
                  setMessageApprovalToken(null);
                  setPreviewSafetyFlag(null);
                  setPreviewError(null);
                }
              }}
              placeholder="I want help saying..."
            />

            {previewLoading && (
              <div className="status">The mediator is shaping your message...</div>
            )}

            {previewError && <div className="error">{previewError}</div>}

            {note.trim() && !previewLoading && !messagePreview && !previewError && (
              <div className="stat-callout">
                Start typing and the mediator will generate a sendable version right here.
              </div>
            )}

            {previewStale && !previewLoading && (
              <div className="stat-callout">
                The room changed. Refreshing the mediator preview so it matches the latest context.
              </div>
            )}

            {messagePreview && (
              <div className="message-process">
                <div className="preview-label">Approve before send</div>

                <div className="chat-item">
                  <div className="chat-author">Your private draft</div>
                  <div className="chat-bubble self muted">{messagePreview.rawText}</div>
                </div>

                <div className="chat-item">
                  <div className="chat-author">Mediator version</div>
                  <div className="chat-bubble mediator">{messagePreview.moderatedText}</div>
                </div>

                <div className="message-guidance">
                  <strong>How this will land</strong>
                  <div className="microcopy">{messagePreview.recipientView}</div>
                </div>

                <div className="message-guidance">
                  <strong>Mediator coaching</strong>
                  <div className="microcopy">{messagePreview.coachNote}</div>
                </div>

                {messagePreview.latestOtherSummary && (
                  <div className="message-guidance soft">
                    <strong>What they most recently shared</strong>
                    <div className="microcopy">{messagePreview.latestOtherSummary}</div>
                  </div>
                )}

                {messagePreview.latestMediatorPrompt && (
                  <div className="message-guidance soft">
                    <strong>Current room prompt</strong>
                    <div className="microcopy">{messagePreview.latestMediatorPrompt}</div>
                  </div>
                )}

                {messagePreview.followUpQuestion && (
                  <div className="message-guidance soft">
                    <strong>Mediator likely next prompt</strong>
                    <div className="microcopy">{messagePreview.followUpQuestion}</div>
                  </div>
                )}

                <ul className="approval-list">
                  {messagePreview.approvalChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {previewSafetyFlag?.flagged && (
              <div className="error">
                The mediator is holding this draft back for safety. {previewSafetyFlag.reason ?? ''}
              </div>
            )}

            <div className="cta-row">
              <button
                className="button primary"
                type="button"
                onClick={handleSendMessage}
                disabled={
                  !note.trim() ||
                  !room.capabilities.canCompose ||
                  sendingMessage ||
                  previewLoading ||
                  Boolean(previewSafetyFlag?.flagged)
                }
              >
                {sendingMessage
                  ? 'Sending...'
                  : previewReady
                  ? 'Approve and send'
                  : 'Wait for mediator preview'}
              </button>
            </div>

            {!room.capabilities.canCompose && (
              <div className="microcopy">
                Messaging is available while the room is actively working through the issue. Right
                now the room is in {statusLabel(room.session.status).toLowerCase()}.
              </div>
            )}
          </div>

          <div className="card archive-card">
            <div className="lane-header">
              <div>
                <div className="pill">Your raw history</div>
                <h2>Private drafts you already shared with the mediator</h2>
              </div>
            </div>
            <div className="private-feed" style={{ marginTop: 14 }}>
              {room.messages.private.length === 0 && (
                <div className="microcopy">No private drafts yet.</div>
              )}
              {room.messages.private.map((message) => (
                <div className="message private" key={message.id}>
                  <div className="message-text">{message.content}</div>
                  <div className="message-time">{formatTimestamp(message.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="room-sidebar">
          <div className="stage-rail">
            <div className="pill">Mediation steps</div>
            {stageDefinitions.map((stage, index) => {
              const stateClass =
                index < activeStage ? 'done' : index === activeStage ? 'active' : '';
              return (
                <div className={`stage-node ${stateClass}`.trim()} key={stage.label}>
                  <div>
                    <strong>{stage.label}</strong>
                    <div className="microcopy">{stage.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <div className="pill">People in the room</div>
            <div className="participant-list" style={{ marginTop: 12 }}>
              {room.participants.map((participant) => (
                <div className="participant-row" key={participant.id}>
                  <strong>{participant.id === room.me.id ? `${participant.displayName} (you)` : participant.displayName}</strong>
                  <div className="microcopy">
                    {participant.role.toLowerCase()} • {participant.consentStatus.toLowerCase()}
                  </div>
                  <div className="microcopy">
                    {presenceCopy(participant.lastSeenAt ?? null, participant.id === room.me.id)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {room.invite && (
            <div className="card">
              <div className="pill">Room access</div>
              <div className="microcopy" style={{ marginTop: 10 }}>
                {inviteStatusCopy(room)}
              </div>
              <div className="microcopy">Sent to {room.invite.destination}</div>
              {room.invite.openedAt && (
                <div className="microcopy">Opened {formatTimestamp(room.invite.openedAt)}</div>
              )}
              {room.invite.acceptedAt && (
                <div className="microcopy">Joined {formatTimestamp(room.invite.acceptedAt)}</div>
              )}
              {room.invite.declinedAt && (
                <div className="microcopy">Declined {formatTimestamp(room.invite.declinedAt)}</div>
              )}
              {room.invite.latestDelivery.lastError && (
                <div className="microcopy">{room.invite.latestDelivery.lastError}</div>
              )}
              <div className="microcopy">Expires {formatTimestamp(room.invite.expiresAt)}</div>
            </div>
          )}

          {room.intake.latestQuestion && (
            <div className="helper-card">
              <div className="pill">Mediator prompt</div>
              <p className="microcopy" style={{ marginTop: 10 }}>
                {room.intake.latestQuestion}
              </p>
            </div>
          )}

          <section className="proposal-card sticky-actions">
            <div className="proposal-header">
              <h2>Resolution plan</h2>
              <span className="chip">{room.proposal ? `v${room.proposal.version}` : 'Not drafted'}</span>
            </div>

            {!room.proposal && (
              <div className="microcopy">
                {room.intake.complete
                  ? 'Both voices are in. You can ask the mediator to draft a balanced plan.'
                  : 'The proposal unlocks after both people have shared their perspective.'}
              </div>
            )}

            {!room.proposal && room.capabilities.canGenerateProposal && (
              <div className="cta-row">
                <button className="button primary" type="button" onClick={handleGenerateProposal}>
                  Draft proposal
                </button>
              </div>
            )}

            {room.proposal && (
              <>
                <h3>{room.proposal.title}</h3>
                <ul className="proposal-list">
                  {room.proposal.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="proposal-subtitle">Acceptance criteria</div>
                <ul className="proposal-list">
                  {room.proposal.acceptanceCriteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}

            {room.capabilities.canVote && (
              <>
                <div>
                  <label className="label" htmlFor="vote-comment">
                    Optional note for the mediator
                  </label>
                  <input
                    className="input"
                    id="vote-comment"
                    value={voteComment}
                    onChange={(event) => setVoteComment(event.currentTarget.value)}
                    placeholder="What would make this feel more fair or doable?"
                  />
                </div>
                <div className="vote-row">
                  <button className="button primary" type="button" onClick={() => handleVote('YES')}>
                    Yes
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => handleVote('NEEDS_CHANGES')}
                  >
                    Needs changes
                  </button>
                  <button className="button secondary" type="button" onClick={() => handleVote('NO')}>
                    No
                  </button>
                </div>
                {myVote && (
                  <div className="vote-note">Your current vote: {myVote.value.replaceAll('_', ' ').toLowerCase()}</div>
                )}
              </>
            )}
          </section>
        </div>
      </section>

      {room.session.status === 'AGREED' && (
        <section className="card">
          <div className="pill">Agreement reached</div>
          <p className="microcopy">
            Both people accepted the mediated plan. You can return to this room anytime if you need
            to revisit or refine it later.
          </p>
        </section>
      )}

      {room.session.status === 'CLOSED_NO_AGREEMENT' && (
        <section className="card">
          <div className="pill">Respectful close</div>
          <p className="microcopy">
            This round ended without a shared agreement. The door stays open for a future attempt
            if both people want to try again.
          </p>
        </section>
      )}

      {status && <div className="status">{status}</div>}
      {error && <div className="error">{error}</div>}
    </main>
  );
}
