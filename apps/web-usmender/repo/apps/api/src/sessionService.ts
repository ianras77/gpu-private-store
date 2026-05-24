import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './db.js';
import { maskDestination } from './deliveryService.js';
import { decryptStoredText, encryptStoredText } from './storageCrypto.js';
import {
  isTerminal,
  transition,
  type SessionEventType,
  type SessionStatus
} from '@usmender/shared';

type DbClient = PrismaClient | Prisma.TransactionClient;
type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];
type AuditActor = 'USER' | 'SYSTEM' | 'CAT';
type MessageVisibility = 'PRIVATE_TO_AUTHOR' | 'SHARED_REPHRASE' | 'SYSTEM';
type MessageKind =
  | 'USER_RAW'
  | 'CAT_REPHRASE'
  | 'CAT_QUESTION'
  | 'USER_REPLY'
  | 'CAT_PROPOSAL'
  | 'CAT_SUMMARY';
type VoteValue = 'YES' | 'NO' | 'NEEDS_CHANGES';
type ParticipantRole = 'INITIATOR' | 'INVITEE';
type ConsentStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
type InviteStatus = 'SENT' | 'OPENED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
type DeliveryChannel = 'IN_APP' | 'SMS_LINK' | 'EMAIL_LINK' | 'IMESSAGE_HANDOFF';
type DeliveryAttemptStatus = 'PENDING' | 'SIMULATED' | 'SENT' | 'DELIVERED' | 'FAILED';
type DeliveryKind = 'INVITE_LINK' | 'MESSAGE_NUDGE' | 'MESSAGE_EVENT';
type MediatedTurnSource = 'INTAKE' | 'MESSAGE';

type SessionParticipantRecord = {
  id: string;
  sessionId: string;
  userId: string;
  role: ParticipantRole;
  consentStatus: ConsentStatus;
  lastSeenAt: Date | null;
  lastReadSequence: number;
  user: {
    displayName: string;
  };
};

type SessionMessageRecord = {
  id: string;
  sessionId: string;
  authorUserId: string | null;
  visibility: MessageVisibility;
  kind: MessageKind;
  content: string;
  createdAt: Date;
};

type SessionVoteRecord = {
  id: string;
  proposalId: string;
  userId: string;
  value: VoteValue;
  comment: string | null;
  createdAt: Date;
};

type SessionProposalRecord = {
  id: string;
  sessionId: string;
  version: number;
  title: string;
  bulletPoints: unknown;
  acceptanceCriteria: unknown;
  createdAt: Date;
  votes: SessionVoteRecord[];
};

type SessionInviteRecord = {
  id: string;
  sessionId: string;
  token: string;
  inviteeEmailOrPhone: string;
  status: InviteStatus;
  deliveryChannel: DeliveryChannel;
  expiresAt: Date;
  openedAt: Date | null;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  expiredAt: Date | null;
  createdAt: Date;
  deliveries: SessionDeliveryAttemptRecord[];
};

type SessionEventRecord = {
  id: string;
  sessionId: string;
  sequence: number;
  actor: AuditActor;
  actorUserId: string | null;
  eventType: string;
  createdAt: Date;
};

type SessionDeliveryAttemptRecord = {
  id: string;
  sessionId: string | null;
  inviteId: string | null;
  mediatedTurnId: string | null;
  kind: DeliveryKind;
  channel: DeliveryChannel;
  provider: string;
  recipient: string;
  status: DeliveryAttemptStatus;
  providerMessageId: string | null;
  payload: unknown;
  errorMessage: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SessionMediatedTurnRecord = {
  id: string;
  sessionId: string;
  authorUserId: string;
  clientMessageId: string;
  eventSequence: number | null;
  rawMessageId: string;
  moderatedMessageId: string;
  source: MediatedTurnSource;
  deliveryChannel: DeliveryChannel;
  approvedAt: Date;
  createdAt: Date;
  deliveries: SessionDeliveryAttemptRecord[];
};

export type SessionRecord = {
  id: string;
  relationshipId: string;
  status: SessionStatus;
  revision: number;
  stateSnapshot: JsonValue | null;
  lastEventAt: Date | null;
  topic: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  relationship: {
    id: string;
    label: string | null;
  } | null;
  participants: SessionParticipantRecord[];
  messages: SessionMessageRecord[];
  mediatedTurns: SessionMediatedTurnRecord[];
  proposals: SessionProposalRecord[];
  invites: SessionInviteRecord[];
};

type SessionSummaryRecord = {
  id: string;
  status: SessionStatus;
  revision: number;
  stateSnapshot: JsonValue | null;
  lastEventAt: Date | null;
  topic: string;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  participants: SessionParticipantRecord[];
  messages: SessionMessageRecord[];
  invites: SessionInviteRecord[];
  sessionEvents: SessionEventRecord[];
};

export const sessionRoomInclude = {
  relationship: true,
  participants: {
    include: { user: true }
  },
  messages: {
    orderBy: { createdAt: 'asc' as const }
  },
  mediatedTurns: {
    orderBy: { approvedAt: 'asc' as const },
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' as const }
      }
    }
  },
  proposals: {
    orderBy: { version: 'desc' as const },
    include: { votes: true }
  },
  invites: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' as const }
      }
    }
  }
};

const sessionSummaryMessageVisibility: MessageVisibility[] = ['SHARED_REPHRASE', 'SYSTEM'];

export const sessionSummaryInclude = {
  participants: {
    include: {
      user: {
        select: {
          displayName: true
        }
      }
    }
  },
  messages: {
    where: {
      visibility: {
        in: sessionSummaryMessageVisibility
      }
    },
    orderBy: { createdAt: 'desc' as const },
    take: 1
  },
  invites: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      deliveries: {
        orderBy: { createdAt: 'desc' as const },
        take: 1
      }
    }
  },
  sessionEvents: {
    orderBy: { sequence: 'desc' as const },
    take: 1
  }
};

type EventMetadata = {
  sequence: number;
  type: string;
  actor: AuditActor;
  at: Date;
  actorUserId?: string | null;
};

type CreateSessionEventInput = {
  sessionId: string;
  actor: AuditActor;
  actorUserId?: string | null;
  eventType: string;
  payload?: JsonValue;
  sessionEventType?: SessionEventType;
  forceNextStatus?: SessionStatus;
};

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function getJsonObject(value: JsonValue | null | undefined) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, JsonValue>;
}

function getStringArray(value: JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function getDecryptedMessageContent(message: { content: string }) {
  return decryptStoredText(message.content) ?? '';
}

function getDecryptedVoteComment(vote: { comment: string | null }) {
  return decryptStoredText(vote.comment);
}

function buildMessageSnippet(message: { content: string }, maxLength = 160) {
  const normalized = getDecryptedMessageContent(message).replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(maxLength - 3, 0)).trimEnd()}...`;
}

function getLatestDeliveryAttempt(deliveries: SessionDeliveryAttemptRecord[] | undefined) {
  return deliveries?.[0] ?? null;
}

function buildDeliverySummary(
  delivery: SessionDeliveryAttemptRecord | null,
  fallbackChannel: DeliveryChannel
) {
  if (!delivery) {
    return {
      channel: fallbackChannel,
      status: fallbackChannel === 'IN_APP' ? ('AVAILABLE' as const) : ('PENDING' as const),
      provider: null,
      lastError: null,
      sentAt: null,
      deliveredAt: null,
      recipient: null,
      providerMessageId: null
    };
  }

  return {
    channel: delivery.channel,
    status: delivery.status,
    provider: delivery.provider,
    lastError: delivery.errorMessage,
    sentAt: delivery.sentAt,
    deliveredAt: delivery.deliveredAt,
    recipient: maskDestination(delivery.recipient),
    providerMessageId: delivery.providerMessageId
  };
}

function buildInviteSummary(invite: SessionInviteRecord | null) {
  if (!invite) {
    return null;
  }

  return {
    id: invite.id,
    status: invite.status,
    deliveryChannel: invite.deliveryChannel,
    destination: maskDestination(invite.inviteeEmailOrPhone),
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    openedAt: invite.openedAt,
    acceptedAt: invite.acceptedAt,
    declinedAt: invite.declinedAt,
    expiredAt: invite.expiredAt,
    latestDelivery: buildDeliverySummary(getLatestDeliveryAttempt(invite.deliveries), invite.deliveryChannel)
  };
}

function buildMessageDeliverySummary(options: {
  turn: SessionMediatedTurnRecord | null;
  messageCreatedAt: Date;
  participants: SessionParticipantRecord[];
}) {
  if (!options.turn) {
    return null;
  }

  const latestDelivery = getLatestDeliveryAttempt(options.turn.deliveries);
  const otherAcceptedParticipants = options.participants.filter(
    (participant) =>
      participant.userId !== options.turn?.authorUserId && participant.consentStatus === 'ACCEPTED'
  );
  const seenByOthers =
    otherAcceptedParticipants.length > 0 &&
    otherAcceptedParticipants.every(
      (participant) =>
        options.turn?.eventSequence !== null && options.turn?.eventSequence !== undefined
          ? participant.lastReadSequence >= options.turn.eventSequence
          : participant.lastSeenAt !== null &&
            participant.lastSeenAt.getTime() >= options.messageCreatedAt.getTime()
    );

  const summary = buildDeliverySummary(latestDelivery, options.turn.deliveryChannel);
  const status =
    seenByOthers
      ? 'READ'
      : summary.status === 'AVAILABLE' && otherAcceptedParticipants.length === 0
        ? 'WAITING_FOR_PARTICIPANT'
        : summary.status;

  return {
    turnId: options.turn.id,
    clientMessageId: options.turn.clientMessageId,
    source: options.turn.source,
    channel: options.turn.deliveryChannel,
    approvedAt: options.turn.approvedAt,
    status,
    provider: summary.provider,
    lastError: summary.lastError,
    sentAt: summary.sentAt,
    deliveredAt: summary.deliveredAt,
    recipient: summary.recipient
  };
}

export function isConversationOpenStatus(status: SessionStatus) {
  return (
    status === 'ACTIVE_INTAKE' ||
    status === 'PROPOSAL_V1' ||
    status === 'VOTING_V1' ||
    status === 'REFINEMENT' ||
    status === 'PROPOSAL_V2' ||
    status === 'VOTING_V2'
  );
}

export const isMessagingOpen = isConversationOpenStatus;

function getWaitingReason(status: SessionStatus) {
  switch (status) {
    case 'DRAFT':
      return 'draft' as const;
    case 'INVITE_READY':
    case 'INVITED':
      return 'invite' as const;
    case 'ACTIVE_INTAKE':
      return 'perspective' as const;
    case 'PROPOSAL_V1':
    case 'VOTING_V1':
    case 'PROPOSAL_V2':
    case 'VOTING_V2':
      return 'vote' as const;
    default:
      return null;
  }
}

function getWaitingOnUserIds(session: SessionSummaryRecord) {
  const snapshot = getJsonObject(session.stateSnapshot);
  const intake = getJsonObject(snapshot?.intake);
  const voting = getJsonObject(snapshot?.voting);

  switch (session.status) {
    case 'DRAFT':
    case 'INVITE_READY':
      return [session.createdByUserId];
    case 'ACTIVE_INTAKE':
      return getStringArray(intake?.waitingOnUserIds);
    case 'PROPOSAL_V1':
    case 'VOTING_V1':
    case 'PROPOSAL_V2':
    case 'VOTING_V2': {
      const pendingUserIds = getStringArray(voting?.pendingUserIds);
      if (pendingUserIds.length > 0) {
        return pendingUserIds;
      }

      return session.participants
        .filter((participant) => participant.consentStatus === 'ACCEPTED')
        .map((participant) => participant.userId);
    }
    default:
      return [];
  }
}

function buildSessionSummary(session: SessionSummaryRecord, userId: string) {
  const me = session.participants.find((participant) => participant.userId === userId);
  if (!me) {
    return null;
  }

  const participants = [...session.participants]
    .sort((left, right) => {
      if (left.role === right.role) {
        return left.user.displayName.localeCompare(right.user.displayName);
      }

      return left.role === 'INITIATOR' ? -1 : 1;
    })
    .map((participant) => ({
      id: participant.userId,
      displayName: participant.user.displayName,
      role: participant.role,
      consentStatus: participant.consentStatus,
      lastSeenAt: participant.lastSeenAt,
      lastReadSequence: participant.lastReadSequence
    }));

  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const latestMessageRecord = session.messages[0] ?? null;
  const latestEvent = session.sessionEvents[0] ?? null;
  const latestMessage =
    latestMessageRecord
      ? {
          id: latestMessageRecord.id,
          visibility: latestMessageRecord.visibility,
          kind: latestMessageRecord.kind,
          snippet: buildMessageSnippet(latestMessageRecord),
          createdAt: latestMessageRecord.createdAt,
          authorUserId: latestMessageRecord.authorUserId,
          authorDisplayName: latestMessageRecord.authorUserId
            ? participantById.get(latestMessageRecord.authorUserId)?.displayName ?? null
            : null,
          authorRole: latestMessageRecord.authorUserId
            ? participantById.get(latestMessageRecord.authorUserId)?.role ?? null
            : null
        }
      : null;

  const lastActivityAt =
    latestEvent?.createdAt ?? session.lastEventAt ?? latestMessageRecord?.createdAt ?? session.updatedAt;
  const latestActivityByMe = latestEvent
    ? latestEvent.actorUserId === userId
    : latestMessageRecord?.authorUserId === userId;
  const seenAt = me.lastSeenAt ?? session.createdAt;
  const latestSequence = latestEvent?.sequence ?? session.revision;
  const waitingOnUserIds = getWaitingOnUserIds(session);
  const waitingOn = waitingOnUserIds
    .map((waitingUserId) => participantById.get(waitingUserId))
    .filter(
      (
        participant
      ): participant is {
        id: string;
        displayName: string;
        role: ParticipantRole;
        consentStatus: ConsentStatus;
        lastSeenAt: Date | null;
        lastReadSequence: number;
      } => Boolean(participant)
    )
    .map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      role: participant.role
    }));

  return {
    id: session.id,
    topic: session.topic,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastActivityAt,
    closedAt: session.closedAt,
    me: {
      id: me.userId,
      role: me.role,
      consentStatus: me.consentStatus,
      lastSeenAt: me.lastSeenAt,
      lastReadSequence: me.lastReadSequence
    },
    participants,
    latestMessage,
    invite: buildInviteSummary(session.invites[0] ?? null),
    cues: {
      unread:
        (lastActivityAt > seenAt || latestSequence > me.lastReadSequence) && !latestActivityByMe,
      waitingOnMe: waitingOnUserIds.includes(userId),
      waitingOnOthers:
        waitingOnUserIds.some((waitingUserId) => waitingUserId !== userId) ||
        session.status === 'INVITED',
      waitingOn,
      reason: getWaitingReason(session.status)
    }
  };
}

export async function loadSessionState(db: DbClient, sessionId: string) {
  const session = await db.mediationSession.findUnique({
    where: { id: sessionId },
    include: sessionRoomInclude
  });
  return session as SessionRecord | null;
}

export async function loadSessionWithAccess(sessionId: string, userId: string, db: DbClient = prisma) {
  const session = await loadSessionState(db, sessionId);
  if (!session) {
    return { error: 'not_found' as const };
  }

  const participant = session.participants.find((item) => item.userId === userId);
  if (!participant) {
    return { error: 'forbidden' as const };
  }

  return { session, participant };
}

export function buildSessionSnapshot(
  session: SessionRecord,
  options?: {
    status?: SessionStatus;
    event?: EventMetadata;
  }
) {
  const effectiveStatus = options?.status ?? (session.status as SessionStatus);
  const privateAuthors = new Set(
    session.messages
      .filter((message) => message.visibility === 'PRIVATE_TO_AUTHOR' && message.authorUserId)
      .map((message) => message.authorUserId as string)
  );
  const sharedAuthors = new Set(
    session.messages
      .filter((message) => message.visibility === 'SHARED_REPHRASE' && message.authorUserId)
      .map((message) => message.authorUserId as string)
  );
  const latestQuestion =
    [...session.messages]
      .reverse()
      .find((message) => message.visibility === 'SYSTEM' && message.kind === 'CAT_QUESTION');
  const acceptedParticipants = session.participants.filter(
    (participant) => participant.consentStatus === 'ACCEPTED'
  );
  const waitingOn = acceptedParticipants.filter(
    (participant) => !sharedAuthors.has(participant.userId)
  );
  const activeProposal = session.proposals[0] ?? null;
  const submittedVoteUserIds = new Set(activeProposal?.votes.map((vote) => vote.userId) ?? []);
  const latestInvite = session.invites[0] ?? null;
  const latestEvent =
    options?.event
      ? {
          sequence: options.event.sequence,
          type: options.event.type,
          actor: options.event.actor,
          actorUserId: options.event.actorUserId ?? null,
          at: options.event.at.toISOString()
        }
      : null;

  return {
    version: options?.event?.sequence ?? session.revision,
    status: effectiveStatus,
    invite: latestInvite
      ? {
          id: latestInvite.id,
          token: latestInvite.token,
          status: latestInvite.status,
          deliveryChannel: latestInvite.deliveryChannel,
          inviteeEmailOrPhone: latestInvite.inviteeEmailOrPhone,
          expiresAt: toIsoString(latestInvite.expiresAt),
          openedAt: toIsoString(latestInvite.openedAt),
          acceptedAt: toIsoString(latestInvite.acceptedAt),
          declinedAt: toIsoString(latestInvite.declinedAt),
          expiredAt: toIsoString(latestInvite.expiredAt),
          createdAt: toIsoString(latestInvite.createdAt)
        }
      : null,
    participants: session.participants.map((participant) => ({
      userId: participant.userId,
      displayName: participant.user.displayName,
      role: participant.role,
      consentStatus: participant.consentStatus,
      hasPrivateMessage: privateAuthors.has(participant.userId),
      hasSharedPerspective: sharedAuthors.has(participant.userId),
      lastSeenAt: toIsoString(participant.lastSeenAt),
      lastReadSequence: participant.lastReadSequence
    })),
    intake: {
      privateMessageCount: session.messages.filter(
        (message) => message.visibility === 'PRIVATE_TO_AUTHOR'
      ).length,
      sharedMessageCount: session.messages.filter(
        (message) => message.visibility === 'SHARED_REPHRASE'
      ).length,
      complete: acceptedParticipants.length > 1 && waitingOn.length === 0,
      waitingOnUserIds: waitingOn.map((participant) => participant.userId),
      waitingOnRoles: waitingOn.map((participant) => participant.role),
      latestQuestion: latestQuestion ? getDecryptedMessageContent(latestQuestion) : null
    },
    proposal: {
      activeProposalId: activeProposal?.id ?? null,
      activeVersion: activeProposal?.version ?? null,
      versions: [...session.proposals]
        .map((proposal) => proposal.version)
        .sort((left, right) => left - right),
      latestTitle: activeProposal?.title ?? null,
      latestCreatedAt: toIsoString(activeProposal?.createdAt)
    },
    voting: {
      activeProposalId: activeProposal?.id ?? null,
      submittedUserIds: [...submittedVoteUserIds],
      pendingUserIds: acceptedParticipants
        .map((participant) => participant.userId)
        .filter((userId) => !submittedVoteUserIds.has(userId)),
      allYes:
        Boolean(activeProposal?.votes.length) &&
        Boolean(activeProposal?.votes.every((vote) => vote.value === 'YES')),
      values:
        activeProposal?.votes.map((vote) => ({
          userId: vote.userId,
          value: vote.value
        })) ?? []
    },
    lastEvent: latestEvent
  };
}

export function buildRoomPayload(session: SessionRecord, userId: string) {
  const me = session.participants.find((item) => item.userId === userId);
  if (!me) {
    return null;
  }

  const turnByRawMessageId = new Map(
    session.mediatedTurns.map((turn) => [turn.rawMessageId, turn] as const)
  );
  const turnByModeratedMessageId = new Map(
    session.mediatedTurns.map((turn) => [turn.moderatedMessageId, turn] as const)
  );
  const timelineOrderByMessageId = new Map(
    session.messages.map((message, index) => [message.id, index] as const)
  );
  const participants = [...session.participants]
    .sort((left, right) => {
      if (left.role === right.role) {
        return left.user.displayName.localeCompare(right.user.displayName);
      }

      return left.role === 'INITIATOR' ? -1 : 1;
    })
    .map((item) => ({
      id: item.userId,
      displayName: item.user.displayName,
      role: item.role,
      consentStatus: item.consentStatus,
      lastSeenAt: item.lastSeenAt,
      lastReadSequence: item.lastReadSequence
    }));

  const privateMessages = session.messages
    .filter(
      (message) => message.visibility === 'PRIVATE_TO_AUTHOR' && message.authorUserId === userId
    )
    .map((message) => ({
      id: message.id,
      content: getDecryptedMessageContent(message),
      createdAt: message.createdAt,
      timelineOrder: timelineOrderByMessageId.get(message.id) ?? 0,
      turnId: turnByRawMessageId.get(message.id)?.id ?? null,
      clientMessageId: turnByRawMessageId.get(message.id)?.clientMessageId ?? null
    }));

  const sharedMessages = session.messages
    .filter((message) => message.visibility === 'SHARED_REPHRASE')
    .map((message) => ({
      id: message.id,
      content: getDecryptedMessageContent(message),
      createdAt: message.createdAt,
      timelineOrder: timelineOrderByMessageId.get(message.id) ?? 0,
      authorUserId: message.authorUserId,
      delivery: buildMessageDeliverySummary({
        turn: turnByModeratedMessageId.get(message.id) ?? null,
        messageCreatedAt: message.createdAt,
        participants: session.participants
      })
    }));

  const systemMessages = session.messages
    .filter((message) => message.visibility === 'SYSTEM')
    .map((message) => ({
      id: message.id,
      content: getDecryptedMessageContent(message),
      kind: message.kind,
      createdAt: message.createdAt,
      timelineOrder: timelineOrderByMessageId.get(message.id) ?? 0
    }));

  const sharedByAuthor = new Set<string>();
  sharedMessages.forEach((message) => {
    if (message.authorUserId) {
      sharedByAuthor.add(message.authorUserId);
    }
  });

  const waitingOn = participants.filter(
    (participant) =>
      participant.consentStatus === 'ACCEPTED' && !sharedByAuthor.has(participant.id)
  );
  const intakeComplete =
    participants.filter((participant) => participant.consentStatus === 'ACCEPTED').length > 1 &&
    waitingOn.length === 0;

  const activeProposal = session.proposals[0] ?? null;
  const proposal =
    activeProposal
      ? {
          id: activeProposal.id,
          version: activeProposal.version,
          title: activeProposal.title,
          bullets: Array.isArray(activeProposal.bulletPoints)
            ? (activeProposal.bulletPoints as string[])
            : [],
          acceptanceCriteria: Array.isArray(activeProposal.acceptanceCriteria)
            ? (activeProposal.acceptanceCriteria as string[])
            : [],
          votes: activeProposal.votes.map((vote) => ({
            userId: vote.userId,
            value: vote.value,
            comment: getDecryptedVoteComment(vote)
          }))
        }
      : null;

  const latestInvite = session.invites[0] ?? null;
  const capabilities = {
    canCompose: me.consentStatus === 'ACCEPTED' && isConversationOpenStatus(session.status),
    canGenerateProposal:
      me.consentStatus === 'ACCEPTED' &&
      session.status === 'ACTIVE_INTAKE' &&
      intakeComplete,
    canVote:
      me.consentStatus === 'ACCEPTED' &&
      (session.status === 'VOTING_V1' || session.status === 'VOTING_V2') &&
      Boolean(proposal),
    canInvite: session.createdByUserId === userId && session.status === 'INVITE_READY',
    canResendInvite:
      session.createdByUserId === userId &&
      session.status === 'INVITED' &&
      latestInvite !== null &&
      latestInvite.status !== 'ACCEPTED' &&
      latestInvite.status !== 'DECLINED' &&
      latestInvite.status !== 'EXPIRED'
  };

  return {
    session: {
      id: session.id,
      topic: session.topic,
      status: session.status,
      revision: session.revision,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      lastEventAt: session.lastEventAt,
      closedAt: session.closedAt
    },
    me: {
      id: me.userId,
      displayName: me.user.displayName,
      role: me.role,
      lastReadSequence: me.lastReadSequence
    },
    participants,
    invite: buildInviteSummary(latestInvite),
    messages: {
      private: privateMessages,
      shared: sharedMessages,
      system: systemMessages
    },
    intake: {
      complete: intakeComplete,
      waitingOn,
      latestQuestion:
        [...systemMessages]
          .reverse()
          .find((message) => message.kind === 'CAT_QUESTION')?.content ?? null
    },
    proposal,
    capabilities,
    workflow: session.stateSnapshot ?? buildSessionSnapshot(session)
  };
}

export async function listUserSessionSummaries(userId: string, db: DbClient = prisma) {
  const sessions = await db.mediationSession.findMany({
    where: {
      participants: {
        some: {
          userId
        }
      }
    },
    include: sessionSummaryInclude,
    orderBy: [{ lastEventAt: 'desc' }, { updatedAt: 'desc' }]
  });

  return (sessions as SessionSummaryRecord[])
    .map((session) => buildSessionSummary(session, userId))
    .filter((session): session is NonNullable<typeof session> => Boolean(session));
}

export async function createStoredMessage(
  db: DbClient,
  input: {
    sessionId: string;
    authorUserId?: string | null;
    visibility: MessageVisibility;
    kind: MessageKind;
    content: string;
  }
) {
  return db.message.create({
    data: {
      sessionId: input.sessionId,
      authorUserId: input.authorUserId ?? null,
      visibility: input.visibility,
      kind: input.kind,
      content: encryptStoredText(input.content)
    }
  });
}

export async function upsertStoredVote(
  db: DbClient,
  input: {
    proposalId: string;
    userId: string;
    value: VoteValue;
    comment?: string | null;
  }
) {
  const commentData =
    input.comment !== undefined
      ? {
          comment: input.comment === null ? null : encryptStoredText(input.comment)
        }
      : {};

  return db.vote.upsert({
    where: {
      proposalId_userId: {
        proposalId: input.proposalId,
        userId: input.userId
      }
    },
    update: {
      value: input.value,
      ...commentData
    },
    create: {
      proposalId: input.proposalId,
      userId: input.userId,
      value: input.value,
      ...commentData
    }
  });
}

export async function createMediatedTurn(
  db: DbClient,
  input: {
    sessionId: string;
    authorUserId: string;
    clientMessageId: string;
    eventSequence?: number | null;
    rawMessageId: string;
    moderatedMessageId: string;
    source?: MediatedTurnSource;
    deliveryChannel?: DeliveryChannel;
  }
) {
  return db.mediationTurn.create({
    data: {
      sessionId: input.sessionId,
      authorUserId: input.authorUserId,
      clientMessageId: input.clientMessageId,
      eventSequence: input.eventSequence ?? null,
      rawMessageId: input.rawMessageId,
      moderatedMessageId: input.moderatedMessageId,
      source: input.source ?? 'MESSAGE',
      deliveryChannel: input.deliveryChannel ?? 'IN_APP'
    }
  });
}

export async function createDeliveryAttempt(
  db: DbClient,
  input: {
    sessionId?: string | null;
    inviteId?: string | null;
    mediatedTurnId?: string | null;
    kind: DeliveryKind;
    channel: DeliveryChannel;
    provider: string;
    recipient: string;
    status: DeliveryAttemptStatus;
    providerMessageId?: string | null;
    payload?: Prisma.InputJsonValue;
    errorMessage?: string | null;
    sentAt?: Date | null;
    deliveredAt?: Date | null;
  }
) {
  return db.deliveryAttempt.create({
    data: {
      sessionId: input.sessionId ?? null,
      inviteId: input.inviteId ?? null,
      mediatedTurnId: input.mediatedTurnId ?? null,
      kind: input.kind,
      channel: input.channel,
      provider: input.provider,
      recipient: input.recipient,
      status: input.status,
      providerMessageId: input.providerMessageId ?? null,
      errorMessage: input.errorMessage ?? null,
      sentAt: input.sentAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      ...(input.payload !== undefined ? { payload: input.payload as Prisma.InputJsonValue } : {})
    }
  });
}

export async function markParticipantRead(
  db: DbClient,
  sessionId: string,
  userId: string,
  readRevision?: number
) {
  const session = await db.mediationSession.findUnique({
    where: { id: sessionId },
    select: { revision: true }
  });
  const nextReadSequence = session
    ? Math.max(0, Math.min(readRevision ?? session.revision, session.revision))
    : undefined;

  await db.participant.updateMany({
    where: { sessionId, userId },
    data: {
      lastSeenAt: new Date(),
      ...(nextReadSequence !== undefined ? { lastReadSequence: nextReadSequence } : {})
    }
  });
}

export async function touchParticipant(db: DbClient, sessionId: string, userId: string) {
  return markParticipantRead(db, sessionId, userId);
}

export async function createSessionEvent(
  db: Prisma.TransactionClient,
  input: CreateSessionEventInput
) {
  const session = await loadSessionState(db, input.sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const previousStatus = session.status as SessionStatus;
  const nextStatus =
    input.forceNextStatus ??
    (input.sessionEventType ? transition(previousStatus, { type: input.sessionEventType }) : previousStatus);
  const createdAt = new Date();
  const sequence = session.revision + 1;
  const snapshot = buildSessionSnapshot(session, {
    status: nextStatus,
    event: {
      sequence,
      type: input.eventType,
      actor: input.actor,
      actorUserId: input.actorUserId ?? null,
      at: createdAt
    }
  });
  const closedAt = isTerminal(nextStatus) ? session.closedAt ?? createdAt : session.closedAt;

  const updatedSession = await db.mediationSession.updateMany({
    where: {
      id: input.sessionId,
      revision: session.revision
    },
    data: {
      status: nextStatus,
      revision: { increment: 1 },
      stateSnapshot: snapshot,
      lastEventAt: createdAt,
      closedAt
    }
  });

  if (updatedSession.count !== 1) {
    throw new Error('Session changed while saving workflow state. Please retry.');
  }

  await db.sessionEvent.create({
    data: {
      sessionId: input.sessionId,
      sequence,
      actor: input.actor,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      previousStatus,
      nextStatus,
      payload: input.payload ?? {}
    }
  });

  await db.auditLog.create({
    data: {
      sessionId: input.sessionId,
      actor: input.actor,
      eventType: input.eventType,
      payload: {
        sequence,
        previousStatus,
        nextStatus,
        detail: input.payload ?? {}
      }
    }
  });

  const refreshed = await loadSessionState(db, input.sessionId);
  if (!refreshed) {
    throw new Error('Session not found after workflow update');
  }

  return refreshed;
}

export async function transitionSession(
  sessionId: string,
  eventType: SessionEventType,
  options?: {
    actor?: AuditActor;
    actorUserId?: string | null;
    payload?: JsonValue;
    tx?: Prisma.TransactionClient;
  }
) {
  if (options?.tx) {
    return createSessionEvent(options.tx, {
      sessionId,
      actor: options.actor ?? 'SYSTEM',
      actorUserId: options.actorUserId ?? null,
      eventType,
      payload: options.payload ?? {},
      sessionEventType: eventType
    });
  }

  return prisma.$transaction((tx: Prisma.TransactionClient) =>
    createSessionEvent(tx, {
      sessionId,
      actor: options?.actor ?? 'SYSTEM',
      actorUserId: options?.actorUserId ?? null,
      eventType,
      payload: options?.payload ?? {},
      sessionEventType: eventType
    })
  );
}
