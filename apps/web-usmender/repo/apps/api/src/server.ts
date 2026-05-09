import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z, ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import {
  detectSafetyFlag,
  SESSION_EVENT,
  type SafetyFlag,
  type SessionStatus
} from '@usmender/shared';
import {
  buildRoomPayload,
  createDeliveryAttempt,
  createMediatedTurn,
  createSessionEvent,
  createStoredMessage,
  isMessagingOpen,
  listUserSessionSummaries,
  loadSessionWithAccess,
  markParticipantRead,
  touchParticipant,
  transitionSession,
  upsertStoredVote
} from './sessionService.js';
import {
  closeoutGuidance,
  draftInvite,
  mediateTurn,
  proposeResolutionV1,
  refineResolutionV2
} from './catClient.js';
import {
  AuthError,
  hashPassword,
  requireAuth,
  signMessageApprovalToken,
  signSessionStreamToken,
  signToken,
  verifyMessageApprovalToken,
  verifyPassword,
  verifySessionStreamToken
} from './auth.js';
import { buildInviteUrl, sendInviteLink, sendMessageNudge } from './deliveryService.js';
import { publishSessionUpdate, subscribeSessionUpdate } from './realtime.js';
import { randomUUID } from 'node:crypto';

export function buildServer() {
  const server = Fastify({ logger: true });

  server.register(cors, { origin: true });
  const deliveryChannelSchema = z.enum(['IN_APP', 'SMS_LINK', 'EMAIL_LINK', 'IMESSAGE_HANDOFF']);
  type DeliveryChannel = z.infer<typeof deliveryChannelSchema>;

  const authRateLimit = new Map<string, { count: number; resetAt: number }>();
  const AUTH_WINDOW_MS = 60_000;
  const AUTH_MAX = 8;
  type AuthenticatedUser = Awaited<ReturnType<typeof requireAuth>>;

  function allowAuthAttempt(ip: string) {
    const now = Date.now();
    const entry = authRateLimit.get(ip);
    if (!entry || entry.resetAt < now) {
      authRateLimit.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
      return true;
    }
    if (entry.count >= AUTH_MAX) {
      return false;
    }
    entry.count += 1;
    return true;
  }

  function buildUserProfile(user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt
    };
  }

  function inferDeliveryChannel(inviteeEmailOrPhone: string): DeliveryChannel {
    return inviteeEmailOrPhone.includes('@') ? 'EMAIL_LINK' : 'SMS_LINK';
  }

  function buildApprovalChecklist(status: SessionStatus) {
    if (
      status === 'PROPOSAL_V1' ||
      status === 'VOTING_V1' ||
      status === 'REFINEMENT' ||
      status === 'PROPOSAL_V2' ||
      status === 'VOTING_V2'
    ) {
      return [
        'This will send the moderated version, not your raw draft.',
        'Tie the message to what feels workable, unfair, or incomplete in the plan.',
        'Name one concrete adjustment or clarification you want next.'
      ];
    }

    return [
      'This will send the moderated version, not your raw draft.',
      'The message should feel specific, respectful, and doable.',
      'You can still edit the draft before approving it.'
    ];
  }

  function buildRecentSharedMessages(room: RoomPayload | null, userId: string) {
    if (!room) {
      return [];
    }

    return room.messages.shared.slice(-6).map((message) => {
      const authorLabel =
        message.authorUserId === userId
          ? 'You'
          : room.participants.find((participant) => participant.id === message.authorUserId)
              ?.displayName ?? 'Other person';

      return `${authorLabel}: ${message.content}`;
    });
  }

  function buildParticipantConversationDigest(room: RoomPayload | null, userId: string) {
    if (!room) {
      return null;
    }

    const authoredMessages = room.messages.shared.filter((message) => message.authorUserId === userId);
    if (authoredMessages.length === 0) {
      return null;
    }

    return authoredMessages
      .slice(-3)
      .map((message, index) => `${index + 1}. ${message.content}`)
      .join('\n');
  }

  function isUniqueConstraintError(error: unknown, targetFields?: string[]) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    if (!targetFields || targetFields.length === 0) {
      return true;
    }

    const metaTarget =
      Array.isArray(error.meta?.target)
        ? error.meta.target.map((value) => String(value))
        : typeof error.meta?.target === 'string'
          ? [String(error.meta.target)]
          : [];

    return targetFields.every((field) => metaTarget.includes(field));
  }

  function isDuplicateMediatedTurnError(error: unknown) {
    return isUniqueConstraintError(error, ['sessionId', 'authorUserId', 'clientMessageId']);
  }

  function isSessionRevisionConflict(error: unknown) {
    return (
      error instanceof Error &&
      error.message === 'Session changed while saving workflow state. Please retry.'
    );
  }

  async function retryOnSessionConflict<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isSessionRevisionConflict(error) || attempt === attempts - 1) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error('Session changed while saving workflow state. Please retry.');
  }

  const VOTE_TARGET_CHANGED_MESSAGE = 'The proposal changed. Refresh and vote again.';

  function isVoteTargetChanged(error: unknown) {
    return error instanceof Error && error.message === VOTE_TARGET_CHANGED_MESSAGE;
  }

  type RoomPayload = ReturnType<typeof buildRoomPayload>;
  type IntakeError =
    | { error: 'not_found' }
    | { error: 'forbidden' }
    | { error: 'consent_required' }
    | { error: 'invalid_state'; status: string }
    | { error: 'stale_preview'; currentRevision: number };
  type IntakeSuccess = {
    room: RoomPayload;
    question?: string;
    safetyFlag?: SafetyFlag;
  };
  type IntakeResult = IntakeError | IntakeSuccess;
  type MessagePreviewData = {
    previewId: string;
    sessionRevision: number;
    rawText: string;
    moderatedText: string;
    recipientView: string;
    coachNote: string;
    latestOtherSummary: string | null;
    latestMediatorPrompt: string | null;
    approvalChecklist: string[];
    followUpQuestion: string | null;
  };
  type MessagePreviewSuccess = {
    preview: MessagePreviewData;
    approvalToken: string;
    safetyFlag: SafetyFlag;
  };
  type MessagePreviewResult = IntakeError | MessagePreviewSuccess;

  async function generateMediatedPreview(
    sessionId: string,
    userId: string,
    content: string
  ): Promise<
    | IntakeError
    | {
        session: Exclude<Awaited<ReturnType<typeof loadSessionWithAccess>>, { error: string }>['session'];
        participant: Exclude<
          Awaited<ReturnType<typeof loadSessionWithAccess>>,
          { error: string }
        >['participant'];
        preview: Omit<MessagePreviewData, 'previewId'>;
        safetyFlag: SafetyFlag;
      }
  > {
    const loaded = await loadSessionWithAccess(sessionId, userId);
    if ('error' in loaded) {
      return { error: loaded.error };
    }

    const { session, participant } = loaded;

    if (participant.consentStatus !== 'ACCEPTED') {
      return { error: 'consent_required' as const };
    }

    if (!isMessagingOpen(session.status)) {
      return { error: 'invalid_state' as const, status: session.status };
    }

    const safety = detectSafetyFlag(content);
    if (safety.flagged) {
      return {
        session,
        participant,
        preview: {
          sessionRevision: session.revision,
          rawText: content,
          moderatedText: '',
          recipientView: '',
          coachNote:
            'The mediator is holding this draft back because it may not be safe or respectful to send yet.',
          latestOtherSummary: null,
          latestMediatorPrompt: null,
          approvalChecklist: [
            'Remove threats, coercion, or demeaning language.',
            'Center your experience instead of the other person’s intent.',
            'Ask for one concrete next step.'
          ],
          followUpQuestion: null
        },
        safetyFlag: safety
      };
    }

    const room = buildRoomPayload(session, userId);
    const latestOtherSummary =
      [...(room?.messages.shared ?? [])]
        .reverse()
        .find((message) => message.authorUserId && message.authorUserId !== userId)?.content ?? null;
    const latestMediatorPrompt = room?.intake.latestQuestion ?? null;
    const mediated = await mediateTurn({
      rawText: content,
      who: participant.role,
      sessionTopic: session.topic,
      ...(session.relationship?.label ? { relationshipType: session.relationship.label } : {}),
      sessionStatus: session.status,
      latestOtherSummary,
      latestMediatorPrompt,
      recentSharedMessages: buildRecentSharedMessages(room, userId),
      proposalTitle: room?.proposal?.title ?? null,
      proposalBullets: room?.proposal?.bullets ?? []
    });

    if (mediated.safetyFlag.flagged) {
      return {
        session,
        participant,
        preview: {
          sessionRevision: session.revision,
          rawText: content,
          moderatedText: '',
          recipientView: '',
          coachNote:
            'The mediator is holding this draft back because it may not be safe or respectful to send yet.',
          latestOtherSummary,
          latestMediatorPrompt,
          approvalChecklist: [
            'Remove threats, coercion, or demeaning language.',
            'Center your experience instead of the other person’s intent.',
            'Ask for one concrete next step.'
          ],
          followUpQuestion: null
        },
        safetyFlag: mediated.safetyFlag
      };
    }

    return {
      session,
      participant,
      preview: {
        sessionRevision: session.revision,
        rawText: content,
        moderatedText: mediated.neutralSummary,
        recipientView: mediated.recipientView,
        coachNote: mediated.coachNote,
        latestOtherSummary,
        latestMediatorPrompt,
        approvalChecklist: buildApprovalChecklist(session.status),
        followUpQuestion: mediated.followUpQuestion ?? null
      },
      safetyFlag: mediated.safetyFlag
    };
  }

  async function storeApprovedMediatedMessage(input: {
    sessionId: string;
    userId: string;
    clientMessageId: string;
    deliveryChannel: DeliveryChannel;
    expectedSessionRevision?: number;
    preview: MessagePreviewData;
    source?: 'INTAKE' | 'MESSAGE';
  }): Promise<IntakeResult> {
    const loaded = await loadSessionWithAccess(input.sessionId, input.userId);
    if ('error' in loaded) {
      return { error: loaded.error };
    }

    const { session, participant } = loaded;

    if (participant.consentStatus !== 'ACCEPTED') {
      return { error: 'consent_required' as const };
    }

    if (!isMessagingOpen(session.status)) {
      return { error: 'invalid_state' as const, status: session.status };
    }

    if (
      input.expectedSessionRevision !== undefined &&
      session.revision !== input.expectedSessionRevision
    ) {
      return {
        error: 'stale_preview' as const,
        currentRevision: session.revision
      };
    }

    const existingTurn = await prisma.mediationTurn.findFirst({
      where: {
        sessionId: input.sessionId,
        authorUserId: input.userId,
        clientMessageId: input.clientMessageId
      }
    });

    if (existingTurn) {
      const refreshed = await loadSessionWithAccess(input.sessionId, input.userId);
      if ('error' in refreshed) {
        return { error: refreshed.error };
      }

      return {
        room: buildRoomPayload(refreshed.session, input.userId)
      };
    }

    const followUpQuestion = input.preview.followUpQuestion?.trim() || null;

    let turnId: string | null = null;
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await touchParticipant(tx, session.id, input.userId);
        const turnEventSequence = session.revision + 1;
        const rawMessage = await createStoredMessage(tx, {
          sessionId: session.id,
          authorUserId: input.userId,
          visibility: 'PRIVATE_TO_AUTHOR',
          kind: 'USER_RAW',
          content: input.preview.rawText
        });
        const moderatedMessage = await createStoredMessage(tx, {
          sessionId: session.id,
          authorUserId: input.userId,
          visibility: 'SHARED_REPHRASE',
          kind: 'CAT_REPHRASE',
          content: input.preview.moderatedText
        });
        const turn = await createMediatedTurn(tx, {
          sessionId: session.id,
          authorUserId: input.userId,
          clientMessageId: input.clientMessageId,
          eventSequence: turnEventSequence,
          rawMessageId: rawMessage.id,
          moderatedMessageId: moderatedMessage.id,
          source: input.source ?? 'MESSAGE',
          deliveryChannel: input.deliveryChannel
        });
        turnId = turn.id;
        await createSessionEvent(tx, {
          sessionId: session.id,
          actor: 'USER',
          actorUserId: input.userId,
          eventType: 'MEDIATED_MESSAGE_SENT',
          payload: {
            role: participant.role,
            clientMessageId: input.clientMessageId,
            turnId: turn.id,
            deliveryChannel: input.deliveryChannel,
            roomStatus: session.status,
            contentLength: input.preview.rawText.length,
            summaryLength: input.preview.moderatedText.length
          }
        });

        if (followUpQuestion) {
          await createStoredMessage(tx, {
            sessionId: session.id,
            visibility: 'SYSTEM',
            kind: 'CAT_QUESTION',
            content: followUpQuestion
          });
          await createSessionEvent(tx, {
            sessionId: session.id,
            actor: 'CAT',
            actorUserId: input.userId,
            eventType: 'MEDIATOR_PROMPT_ASKED',
            payload: {
              role: participant.role,
              roomStatus: session.status,
              questionLength: followUpQuestion.length
            }
          });
        }

        await touchParticipant(tx, session.id, input.userId);
      });
    } catch (error) {
      if (!isDuplicateMediatedTurnError(error)) {
        if (!isSessionRevisionConflict(error)) {
          throw error;
        }

        const refreshed = await loadSessionWithAccess(input.sessionId, input.userId);
        if ('error' in refreshed) {
          return { error: refreshed.error };
        }

        return {
          error: 'stale_preview' as const,
          currentRevision: refreshed.session.revision
        };
      }

      const refreshed = await loadSessionWithAccess(input.sessionId, input.userId);
      if ('error' in refreshed) {
        return { error: refreshed.error };
      }

      return {
        room: buildRoomPayload(refreshed.session, input.userId)
      };
    }

    if (
      turnId &&
      input.deliveryChannel === 'SMS_LINK' &&
      session.createdByUserId === input.userId
    ) {
      const latestInvite = session.invites[0] ?? null;
      if (latestInvite && !latestInvite.inviteeEmailOrPhone.includes('@')) {
        const nudgeResult = await sendMessageNudge({
          sessionId: session.id,
          topic: session.topic,
          destination: latestInvite.inviteeEmailOrPhone
        });

        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await createDeliveryAttempt(tx, {
            sessionId: session.id,
            mediatedTurnId: turnId,
            kind: 'MESSAGE_NUDGE',
            channel: input.deliveryChannel,
            provider: nudgeResult.provider,
            recipient: latestInvite.inviteeEmailOrPhone,
            status: nudgeResult.status,
            providerMessageId: nudgeResult.providerMessageId ?? null,
            errorMessage: nudgeResult.errorMessage ?? null,
            sentAt: nudgeResult.sentAt ?? null,
            deliveredAt: nudgeResult.deliveredAt ?? null,
            ...(
              nudgeResult.payload && typeof nudgeResult.payload === 'object'
                ? { payload: nudgeResult.payload as Prisma.JsonObject }
                : {}
            )
          });
          await createSessionEvent(tx, {
            sessionId: session.id,
            actor: 'SYSTEM',
            actorUserId: input.userId,
            eventType: 'MESSAGE_NUDGE_QUEUED',
            payload: {
              turnId,
              channel: input.deliveryChannel,
              status: nudgeResult.status
            }
          });
        });
      }
    }

    const refreshed = await loadSessionWithAccess(input.sessionId, input.userId);
    if ('error' in refreshed) {
      return { error: refreshed.error };
    }

    publishSessionUpdate(session.id, 'message_sent');

    return {
      room: buildRoomPayload(refreshed.session, input.userId),
      ...(followUpQuestion ? { question: followUpQuestion } : {})
    };
  }

  async function handleIntakeSubmission(
    sessionId: string,
    userId: string,
    content: string
  ): Promise<IntakeResult> {
    const generated = await generateMediatedPreview(sessionId, userId, content);
    if ('error' in generated) {
      return generated;
    }

    if (generated.safetyFlag.flagged) {
      await transitionSession(generated.session.id, SESSION_EVENT.SAFETY_ABORT, {
        actor: 'SYSTEM',
        actorUserId: userId,
        payload: {
          source: 'local_intake_check',
          role: generated.participant.role,
          reason: generated.safetyFlag.reason ?? 'safety_flagged'
        }
      });
      publishSessionUpdate(generated.session.id, 'safety_abort');
      const refreshed = await loadSessionWithAccess(sessionId, userId);
      if ('error' in refreshed) {
        return { error: refreshed.error };
      }

      return {
        room: buildRoomPayload(refreshed.session, userId),
        safetyFlag: generated.safetyFlag
      };
    }

    const approvalPreview: MessagePreviewData = {
      previewId: randomUUID(),
      ...generated.preview
    };

    return storeApprovedMediatedMessage({
      sessionId,
      userId,
      clientMessageId: approvalPreview.previewId,
      deliveryChannel: 'IN_APP',
      expectedSessionRevision: approvalPreview.sessionRevision,
      preview: approvalPreview,
      source: 'INTAKE'
    });
  }

  async function previewMediatedMessage(
    sessionId: string,
    userId: string,
    content: string
  ): Promise<MessagePreviewResult> {
    const generated = await generateMediatedPreview(sessionId, userId, content);
    if ('error' in generated) {
      return generated;
    }

    const preview = {
      previewId: randomUUID(),
      ...generated.preview
    };

    return {
      preview,
      approvalToken: signMessageApprovalToken({
        previewId: preview.previewId,
        sessionId,
        userId,
        sessionRevision: preview.sessionRevision,
        content: preview.rawText,
        moderatedText: preview.moderatedText,
        recipientView: preview.recipientView,
        coachNote: preview.coachNote,
        latestOtherSummary: preview.latestOtherSummary,
        latestMediatorPrompt: preview.latestMediatorPrompt,
        approvalChecklist: preview.approvalChecklist,
        followUpQuestion: preview.followUpQuestion
      }),
      safetyFlag: generated.safetyFlag
    };
  }

  function formatCloseoutMessage(input: {
    closureMessage: string;
    nextSteps: string[];
    suggestedFollowUpWindowDays: number;
  }) {
    const nextSteps =
      input.nextSteps.length > 0 ? `\n\nNext steps:\n- ${input.nextSteps.join('\n- ')}` : '';
    const followUp =
      input.suggestedFollowUpWindowDays > 0
        ? `\n\nSuggested follow-up window: ${input.suggestedFollowUpWindowDays} day(s).`
        : '';

    return `${input.closureMessage}${nextSteps}${followUp}`;
  }

  async function appendCloseoutMessage(input: {
    sessionId: string;
    actorUserId: string;
    sessionSummary: string;
    blockers: string[];
  }) {
    const guidance = await closeoutGuidance({
      sessionSummary: input.sessionSummary,
      blockers: input.blockers
    });

    if (guidance.safetyFlag.flagged) {
      return;
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createStoredMessage(tx, {
        sessionId: input.sessionId,
        visibility: 'SYSTEM',
        kind: 'CAT_SUMMARY',
        content: formatCloseoutMessage(guidance)
      });
      await createSessionEvent(tx, {
        sessionId: input.sessionId,
        actor: 'CAT',
        actorUserId: input.actorUserId,
        eventType: 'CLOSEOUT_GUIDANCE_ADDED',
        payload: {
          blockerCount: input.blockers.length,
          nextStepCount: guidance.nextSteps.length,
          suggestedFollowUpWindowDays: guidance.suggestedFollowUpWindowDays
        }
      });
      await touchParticipant(tx, input.sessionId, input.actorUserId);
    });
  }

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.code(400).send({ error: 'Invalid request', details: error.flatten() });
      return;
    }

    if (error instanceof AuthError) {
      reply.code(401).send({ error: error.message });
      return;
    }

    reply.code(500).send({ error: 'Unexpected server error' });
  });

  server.get('/health', async () => ({ ok: true }));
  server.get('/healthz', async () => ({ ok: true }));

  server.post('/auth/signup', async (request, reply) => {
    if (!allowAuthAttempt(request.ip)) {
      reply.code(429).send({ error: 'Too many attempts. Try again soon.' });
      return;
    }

    const schema = z.object({
      email: z.string().email(),
      displayName: z.string().min(2),
      password: z.string().min(8)
    });

    const body = schema.parse(request.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      reply.code(409).send({ error: 'Account already exists.' });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password)
      }
    });

    await prisma.userPlan.create({
      data: {
        userId: user.id,
        plan: 'FREE'
      }
    });

    reply.code(201).send({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, displayName: user.displayName }
    });
  });

  server.post('/auth/login', async (request, reply) => {
    if (!allowAuthAttempt(request.ip)) {
      reply.code(429).send({ error: 'Too many attempts. Try again soon.' });
      return;
    }

    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8)
    });

    const body = schema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      reply.code(401).send({ error: 'Invalid credentials.' });
      return;
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      reply.code(401).send({ error: 'Invalid credentials.' });
      return;
    }

    reply.send({
      token: signToken(user.id),
      user: { id: user.id, email: user.email, displayName: user.displayName }
    });
  });

  server.get('/sessions', async (request, reply) => {
    const user = await requireAuth(request);
    const sessions = await listUserSessionSummaries(user.id);

    reply.send({ sessions });
  });

  server.get('/me', async (request, reply) => {
    const user = await requireAuth(request);
    reply.send(buildUserProfile(user));
  });

  server.get('/users/me', async (request, reply) => {
    const user = await requireAuth(request);
    reply.send(buildUserProfile(user));
  });

  server.get('/users/search', async (request, reply) => {
    const user = await requireAuth(request);
    const querySchema = z.object({
      q: z.string().trim().min(2).max(80),
      limit: z.coerce.number().int().min(1).optional()
    });

    const query = querySchema.parse(request.query);
    const limit = Math.min(query.limit ?? 8, 10);
    const results = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        OR: [
          {
            displayName: {
              contains: query.q,
              mode: 'insensitive'
            }
          },
          {
            email: {
              contains: query.q,
              mode: 'insensitive'
            }
          }
        ]
      },
      select: {
        id: true,
        displayName: true,
        email: true
      },
      orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
      take: limit
    });

    reply.send({
      query: query.q,
      results
    });
  });

  server.get('/plan', async (request, reply) => {
    const user = await requireAuth(request);
    const plan = await prisma.userPlan.findUnique({ where: { userId: user.id } });
    const planType = plan?.plan ?? 'FREE';

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    const sessionsThisMonth = await prisma.mediationSession.count({
      where: {
        createdByUserId: user.id,
        createdAt: {
          gte: monthStart,
          lt: monthEnd
        }
      }
    });

    const limit = planType === 'FREE' ? 1 : null;

    reply.send({
      plan: planType,
      sessionsThisMonth,
      limit,
      upgradeAvailable: planType === 'FREE'
    });
  });

  server.post('/relationships', async (request, reply) => {
    const user = await requireAuth(request);
    const schema = z.object({ label: z.string().min(2).optional() });
    const body = schema.parse(request.body);

    const relationship = await prisma.relationship.create({
      data: {
        createdByUserId: user.id,
        label: body.label ?? null,
        participantAUserId: user.id
      }
    });

    reply.code(201).send(relationship);
  });

  server.post('/sessions', async (request, reply) => {
    const user = await requireAuth(request);
    const schema = z.object({
      relationshipId: z.string().uuid(),
      topic: z.string().min(2)
    });

    const body = schema.parse(request.body);

    const relationship = await prisma.relationship.findFirst({
      where: {
        id: body.relationshipId,
        OR: [
          { createdByUserId: user.id },
          { participantAUserId: user.id },
          { participantBUserId: user.id }
        ]
      }
    });

    if (!relationship) {
      reply.code(403).send({ error: 'Relationship not found.' });
      return;
    }

    const plan = await prisma.userPlan.findUnique({ where: { userId: user.id } });
    const planType = plan?.plan ?? 'FREE';

    if (planType === 'FREE') {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));

      const count = await prisma.mediationSession.count({
        where: {
          createdByUserId: user.id,
          createdAt: {
            gte: monthStart,
            lt: monthEnd
          }
        }
      });

      if (count >= 1) {
        reply.code(402).send({
          error: 'Free plan limit reached.',
          upgrade: true,
          limit: 1
        });
        return;
      }
    }

    const session = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdSession = await tx.mediationSession.create({
        data: {
          relationshipId: body.relationshipId,
          topic: body.topic,
          createdByUserId: user.id
        }
      });

      await tx.participant.create({
        data: {
          sessionId: createdSession.id,
          userId: user.id,
          role: 'INITIATOR',
          consentStatus: 'ACCEPTED'
        }
      });

      return createSessionEvent(tx, {
        sessionId: createdSession.id,
        actor: 'USER',
        actorUserId: user.id,
        eventType: 'SESSION_CREATED',
        payload: {
          relationshipId: body.relationshipId,
          topic: body.topic
        }
      });
    });

    reply.code(201).send(session);
  });

  server.post('/sessions/:id/need', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      content: z.string().min(2),
      relationshipType: z.string().min(2).optional(),
      desiredOutcome: z.string().min(2).optional(),
      boundaries: z.array(z.string().min(1)).optional()
    });

    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const session = await prisma.mediationSession.findUnique({ where: { id } });
    if (!session) {
      reply.code(404).send({ error: 'Session not found' });
      return;
    }

    if (session.createdByUserId !== user.id) {
      reply.code(403).send({ error: 'Not authorized for this session.' });
      return;
    }

    if (session.status !== 'DRAFT') {
      reply.code(400).send({ error: `Session status is ${session.status}` });
      return;
    }

    const safety = detectSafetyFlag(body.content);
    if (safety.flagged) {
      const updated = await transitionSession(session.id, SESSION_EVENT.SAFETY_ABORT, {
        actor: 'SYSTEM',
        actorUserId: user.id,
        payload: {
          source: 'local_need_check',
          reason: safety.reason ?? 'safety_flagged'
        }
      });
      publishSessionUpdate(session.id, 'safety_abort');
      reply.send({ session: updated, safetyFlag: safety });
      return;
    }

    const inviteDraft = await draftInvite({
      initiatorNeedRaw: body.content,
      relationshipType: body.relationshipType ?? 'relationship',
      ...(body.desiredOutcome !== undefined ? { desiredOutcome: body.desiredOutcome } : {}),
      ...(body.boundaries !== undefined ? { boundaries: body.boundaries } : {})
    });

    if (inviteDraft.safetyFlag.flagged) {
      const updated = await transitionSession(session.id, SESSION_EVENT.SAFETY_ABORT, {
        actor: 'CAT',
        actorUserId: user.id,
        payload: {
          source: 'draft_invite',
          reason: inviteDraft.safetyFlag.reason ?? 'safety_flagged'
        }
      });
      publishSessionUpdate(session.id, 'safety_abort');
      reply.send({ session: updated, safetyFlag: inviteDraft.safetyFlag });
      return;
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await touchParticipant(tx, session.id, user.id);
      await createStoredMessage(tx, {
        sessionId: session.id,
        authorUserId: user.id,
        visibility: 'PRIVATE_TO_AUTHOR',
        kind: 'USER_RAW',
        content: body.content
      });
      await createStoredMessage(tx, {
        sessionId: session.id,
        authorUserId: user.id,
        visibility: 'SHARED_REPHRASE',
        kind: 'CAT_REPHRASE',
        content: inviteDraft.issueSummaryNeutral
      });

      if (body.boundaries && body.boundaries.length > 0) {
        await createStoredMessage(tx, {
          sessionId: session.id,
          visibility: 'SYSTEM',
          kind: 'CAT_SUMMARY',
          content: `Session boundaries: ${body.boundaries.join(' | ')}`
        });
      }

      if (body.desiredOutcome) {
        await createStoredMessage(tx, {
          sessionId: session.id,
          visibility: 'SYSTEM',
          kind: 'CAT_SUMMARY',
          content: `Desired outcome: ${body.desiredOutcome}`
        });
      }

      await createStoredMessage(tx, {
        sessionId: session.id,
        visibility: 'SYSTEM',
        kind: 'CAT_SUMMARY',
        content: `Invite preview: ${inviteDraft.subjectLine} - ${inviteDraft.inviteMessageNeutral}`
      });

      return createSessionEvent(tx, {
        sessionId: session.id,
        actor: 'USER',
        actorUserId: user.id,
        eventType: SESSION_EVENT.SUBMIT_NEED,
        sessionEventType: SESSION_EVENT.SUBMIT_NEED,
        payload: {
          contentLength: body.content.length,
          relationshipType: body.relationshipType ?? 'relationship',
          desiredOutcomeProvided: Boolean(body.desiredOutcome),
          boundaryCount: body.boundaries?.length ?? 0,
          neutralSummaryLength: inviteDraft.issueSummaryNeutral.length
        }
      });
    });
    publishSessionUpdate(session.id, 'need_submitted');
    reply.send({ session: updated, inviteDraft, safetyFlag: safety });
  });

  server.post('/sessions/:id/invite', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      inviteeEmailOrPhone: z.string().min(3),
      deliveryChannel: deliveryChannelSchema.optional()
    });

    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const session = await prisma.mediationSession.findUnique({
      where: { id },
      include: {
        relationship: true,
        invites: {
          where: {
            status: {
              in: ['SENT', 'OPENED']
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
    if (!session) {
      reply.code(404).send({ error: 'Session not found' });
      return;
    }

    if (session.createdByUserId !== user.id) {
      reply.code(403).send({ error: 'Not authorized for this session.' });
      return;
    }

    if (session.status !== 'INVITE_READY' && session.status !== 'INVITED') {
      reply.code(400).send({ error: `Session status is ${session.status}` });
      return;
    }

    const deliveryChannel = body.deliveryChannel ?? inferDeliveryChannel(body.inviteeEmailOrPhone);
    if (
      body.inviteeEmailOrPhone.includes('@') &&
      body.inviteeEmailOrPhone.toLowerCase() === user.email.toLowerCase()
    ) {
      reply.code(400).send({ error: 'You cannot invite yourself into the room.' });
      return;
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const existingInvite = session.invites[0] ?? null;

    const invite = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (session.status === 'INVITED' && existingInvite) {
        await tx.invite.update({
          where: { id: existingInvite.id },
          data: {
            deliveryChannel
          }
        });
        await createSessionEvent(tx, {
          sessionId: session.id,
          actor: 'USER',
          actorUserId: user.id,
          eventType: 'INVITE_RESENT',
          payload: {
            inviteId: existingInvite.id,
            inviteeEmailOrPhone: existingInvite.inviteeEmailOrPhone,
            deliveryChannel
          }
        });

        return tx.invite.findUniqueOrThrow({ where: { id: existingInvite.id } });
      }

      const createdInvite = await tx.invite.create({
        data: {
          sessionId: session.id,
          token,
          inviteeEmailOrPhone: body.inviteeEmailOrPhone,
          expiresAt,
          status: 'SENT',
          deliveryChannel
        }
      });

      await createSessionEvent(tx, {
        sessionId: session.id,
        actor: 'USER',
        actorUserId: user.id,
        eventType: SESSION_EVENT.SEND_INVITE,
        sessionEventType: SESSION_EVENT.SEND_INVITE,
        payload: {
          inviteId: createdInvite.id,
          inviteeEmailOrPhone: createdInvite.inviteeEmailOrPhone,
          expiresAt: createdInvite.expiresAt.toISOString(),
          deliveryChannel
        }
      });

      return createdInvite;
    });

    const deliveryResult = await sendInviteLink({
      inviteToken: invite.token,
      sessionId: session.id,
      topic: session.topic,
      destination: invite.inviteeEmailOrPhone,
      deliveryChannel
    });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createDeliveryAttempt(tx, {
        sessionId: session.id,
        inviteId: invite.id,
        kind: 'INVITE_LINK',
        channel: deliveryChannel,
        provider: deliveryResult.provider,
        recipient: invite.inviteeEmailOrPhone,
        status: deliveryResult.status,
        providerMessageId: deliveryResult.providerMessageId ?? null,
        errorMessage: deliveryResult.errorMessage ?? null,
        sentAt: deliveryResult.sentAt ?? null,
        deliveredAt: deliveryResult.deliveredAt ?? null,
        ...(
          deliveryResult.payload && typeof deliveryResult.payload === 'object'
            ? { payload: deliveryResult.payload as Prisma.JsonObject }
            : {}
        )
      });
      await createSessionEvent(tx, {
        sessionId: session.id,
        actor: 'SYSTEM',
        actorUserId: user.id,
        eventType: 'INVITE_DELIVERY_RECORDED',
        payload: {
          inviteId: invite.id,
          provider: deliveryResult.provider,
          status: deliveryResult.status,
          deliveryChannel
        }
      });
    });

    publishSessionUpdate(session.id, session.status === 'INVITED' ? 'invite_resent' : 'invite_sent');

    reply.code(session.status === 'INVITED' ? 200 : 201).send({
      inviteToken: invite.token,
      inviteUrl: buildInviteUrl(invite.token),
      expiresAt: invite.expiresAt,
      sessionId: session.id,
      deliveryChannel,
      delivery: {
        status: deliveryResult.status,
        provider: deliveryResult.provider,
        errorMessage: deliveryResult.errorMessage ?? null,
        sentAt: deliveryResult.sentAt ?? null,
        deliveredAt: deliveryResult.deliveredAt ?? null
      }
    });
  });

  server.get('/sessions/:id/room', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    await touchParticipant(prisma, id, user.id);

    const loaded = await loadSessionWithAccess(id, user.id);
    if ('error' in loaded) {
      if (loaded.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
      } else {
        reply.code(403).send({ error: 'Not authorized for this session.' });
      }
      return;
    }

    const room = buildRoomPayload(loaded.session, user.id);
    if (!room) {
      reply.code(500).send({ error: 'Unable to load session room.' });
      return;
    }

    reply.send(room);
  });

  server.post('/sessions/:id/read', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      revision: z.number().int().min(0).optional()
    });

    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body ?? {});
    const loaded = await loadSessionWithAccess(id, user.id);
    if ('error' in loaded) {
      if (loaded.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
      } else {
        reply.code(403).send({ error: 'Not authorized for this session.' });
      }
      return;
    }

    const acknowledgedRevision =
      body.revision !== undefined
        ? Math.min(body.revision, loaded.session.revision)
        : loaded.session.revision;

    await markParticipantRead(prisma, id, user.id, acknowledgedRevision);
    publishSessionUpdate(id, 'read_state');

    reply.send({
      ok: true,
      revision: loaded.session.revision,
      acknowledgedRevision
    });
  });

  server.post('/sessions/:id/stream-token', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    const loaded = await loadSessionWithAccess(id, user.id);
    if ('error' in loaded) {
      if (loaded.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
      } else {
        reply.code(403).send({ error: 'Not authorized for this session.' });
      }
      return;
    }

    reply.send({
      streamToken: signSessionStreamToken({
        sessionId: id,
        userId: user.id
      }),
      expiresInSeconds: 60 * 60 * 2
    });
  });

  server.get('/sessions/:id/events', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ streamToken: z.string().min(10) });
    const { id } = paramsSchema.parse(request.params);
    const { streamToken } = querySchema.parse(request.query);
    const stream = verifySessionStreamToken(streamToken);

    if (stream.sessionId !== id) {
      reply.code(403).send({ error: 'Stream token does not match this room.' });
      return;
    }

    const loaded = await loadSessionWithAccess(id, stream.userId);
    if ('error' in loaded) {
      if (loaded.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
      } else {
        reply.code(403).send({ error: 'Not authorized for this session.' });
      }
      return;
    }

    const sendEvent = (event: string, payload: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    let closed = false;
    let deliveryChain = Promise.resolve();

    const sendLatestRoom = async () => {
      const nextLoaded = await loadSessionWithAccess(id, stream.userId);
      if ('error' in nextLoaded) {
        sendEvent('room_error', { error: nextLoaded.error });
        return;
      }

      const room = buildRoomPayload(nextLoaded.session, stream.userId);
      if (!room) {
        sendEvent('room_error', { error: 'Unable to load session room.' });
        return;
      }

      sendEvent('room', room);
    };

    reply.raw.write(': connected\n\n');
    reply.raw.write('retry: 2000\n\n');
    sendEvent('room', buildRoomPayload(loaded.session, stream.userId));

    const unsubscribe = subscribeSessionUpdate(id, () => {
      deliveryChain = deliveryChain
        .then(async () => {
          if (closed) {
            return;
          }

          await sendLatestRoom();
        })
        .catch(() => {
          if (!closed) {
            sendEvent('room_error', { error: 'Live room updates fell behind. Reconnecting...' });
          }
        });
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 15_000);

    const cleanup = () => {
      if (closed) {
        return;
      }
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
    };

    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);
  });

  server.get('/sessions/:id/history', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({
      after: z.coerce.number().int().min(0).optional()
    });
    const { id } = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    const loaded = await loadSessionWithAccess(id, user.id);
    if ('error' in loaded) {
      if (loaded.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
      } else {
        reply.code(403).send({ error: 'Not authorized for this session.' });
      }
      return;
    }

    const events = await prisma.sessionEvent.findMany({
      where: {
        sessionId: id,
        ...(query.after !== undefined
          ? {
              sequence: {
                gt: query.after
              }
            }
          : {})
      },
      orderBy: { sequence: 'asc' }
    });

    reply.send({
      session: {
        id: loaded.session.id,
        status: loaded.session.status,
        revision: loaded.session.revision,
        topic: loaded.session.topic,
        createdAt: loaded.session.createdAt,
        lastEventAt: loaded.session.lastEventAt,
        closedAt: loaded.session.closedAt
      },
      after: query.after ?? null,
      snapshot: loaded.session.stateSnapshot,
      events
    });
  });

  server.post('/sessions/:id/intake', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      content: z.string().min(2)
    });

    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await handleIntakeSubmission(id, user.id, body.content);

    if ('error' in result) {
      if (result.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
        return;
      }
      if (result.error === 'forbidden') {
        reply.code(403).send({ error: 'Not authorized for this session.' });
        return;
      }
      if (result.error === 'consent_required') {
        reply.code(403).send({ error: 'Consent required before continuing.' });
        return;
      }
      if (result.error === 'invalid_state') {
        reply.code(400).send({ error: `Session status is ${result.status}` });
        return;
      }
      if (result.error === 'stale_preview') {
        reply.code(409).send({ error: 'The room changed. Refresh the mediator preview and try again.' });
        return;
      }
      reply.code(400).send({ error: 'Unable to submit intake.' });
      return;
    }

    reply.send(result.room);
  });

  server.post('/sessions/:id/proposals', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const { id } = paramsSchema.parse(request.params);

    const loaded = await loadSessionWithAccess(id, user.id);
    if ('error' in loaded) {
      if (loaded.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
      } else {
        reply.code(403).send({ error: 'Not authorized for this session.' });
      }
      return;
    }

    const { session } = loaded;
    if (session.status !== 'ACTIVE_INTAKE' && session.status !== 'PROPOSAL_V1') {
      reply.code(400).send({ error: `Session status is ${session.status}` });
      return;
    }

    const initiator = session.participants.find(
      (item: { userId: string; role: string }) => item.role === 'INITIATOR'
    );
    const invitee = session.participants.find(
      (item: { userId: string; role: string }) => item.role === 'INVITEE'
    );
    if (!initiator || !invitee) {
      reply.code(400).send({ error: 'Both participants are required.' });
      return;
    }

    const currentRoom = buildRoomPayload(session, user.id);
    const initiatorSummary = buildParticipantConversationDigest(currentRoom, initiator.userId);
    const inviteeSummary = buildParticipantConversationDigest(currentRoom, invitee.userId);

    if (!initiatorSummary || !inviteeSummary) {
      reply.code(400).send({ error: 'Both perspectives are required before proposing.' });
      return;
    }

    const existing = session.proposals.find((proposal: { version: number }) => proposal.version === 1);
    try {
      if (!existing) {
        const proposalDraft = await proposeResolutionV1({
          neutralSummaryOfInitiator: initiatorSummary,
          neutralSummaryOfInvitee: inviteeSummary,
          constraints:
            currentRoom?.messages.system
              .filter((message) => message.kind === 'CAT_QUESTION')
              .slice(-3)
              .map((message) => message.content) ?? []
        });

        if (proposalDraft.safetyFlag.flagged) {
          await transitionSession(session.id, SESSION_EVENT.SAFETY_ABORT, {
            actor: 'CAT',
            actorUserId: user.id,
            payload: {
              source: 'proposal_v1',
              reason: proposalDraft.safetyFlag.reason ?? 'safety_flagged'
            }
          });
          publishSessionUpdate(session.id, 'safety_abort');
          const refreshed = await loadSessionWithAccess(id, user.id);
          if ('error' in refreshed) {
            reply.code(500).send({ error: 'Unable to refresh session.' });
            return;
          }
          reply.send(buildRoomPayload(refreshed.session, user.id));
          return;
        }
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          if (session.status === 'ACTIVE_INTAKE') {
            await createSessionEvent(tx, {
              sessionId: session.id,
              actor: 'SYSTEM',
              actorUserId: user.id,
              eventType: SESSION_EVENT.INTAKE_COMPLETE,
              sessionEventType: SESSION_EVENT.INTAKE_COMPLETE,
              payload: {
                initiatorSummaryLength: initiatorSummary.length,
                inviteeSummaryLength: inviteeSummary.length
              }
            });
          }

          await tx.proposal.create({
            data: {
              sessionId: session.id,
              version: 1,
              title: proposalDraft.proposal.title,
              bulletPoints: proposalDraft.proposal.bullets,
              acceptanceCriteria: proposalDraft.proposal.acceptanceCriteria
            }
          });

          await createStoredMessage(tx, {
            sessionId: session.id,
            visibility: 'SYSTEM',
            kind: 'CAT_PROPOSAL',
            content: `Proposal v1 drafted: ${proposalDraft.proposal.title}`
          });

          await createSessionEvent(tx, {
            sessionId: session.id,
            actor: 'CAT',
            actorUserId: user.id,
            eventType: 'PROPOSAL_V1_CREATED',
            payload: {
              version: 1,
              bulletCount: proposalDraft.proposal.bullets.length,
              acceptanceCriteriaCount: proposalDraft.proposal.acceptanceCriteria.length
            }
          });

          await createSessionEvent(tx, {
            sessionId: session.id,
            actor: 'CAT',
            actorUserId: user.id,
            eventType: SESSION_EVENT.PROPOSAL_READY,
            sessionEventType: SESSION_EVENT.PROPOSAL_READY,
            payload: {
              version: 1
            }
          });

          await touchParticipant(tx, session.id, user.id);
        });
      } else {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          if (session.status === 'ACTIVE_INTAKE') {
            await createSessionEvent(tx, {
              sessionId: session.id,
              actor: 'SYSTEM',
              actorUserId: user.id,
              eventType: SESSION_EVENT.INTAKE_COMPLETE,
              sessionEventType: SESSION_EVENT.INTAKE_COMPLETE,
              payload: {
                initiatorSummaryLength: initiatorSummary.length,
                inviteeSummaryLength: inviteeSummary.length
              }
            });
          }

          await createSessionEvent(tx, {
            sessionId: session.id,
            actor: 'CAT',
            actorUserId: user.id,
            eventType: SESSION_EVENT.PROPOSAL_READY,
            sessionEventType: SESSION_EVENT.PROPOSAL_READY,
            payload: {
              version: existing.version
            }
          });

          await touchParticipant(tx, session.id, user.id);
        });
      }
    } catch (error) {
      if (
        !isSessionRevisionConflict(error) &&
        !isUniqueConstraintError(error, ['sessionId', 'version'])
      ) {
        throw error;
      }
    }

    const refreshed = await loadSessionWithAccess(id, user.id);
    if ('error' in refreshed) {
      reply.code(500).send({ error: 'Unable to refresh session.' });
      return;
    }

    publishSessionUpdate(session.id, 'proposal_ready');
    reply.send(buildRoomPayload(refreshed.session, user.id));
  });

  server.post('/sessions/:id/votes', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      value: z.enum(['YES', 'NO', 'NEEDS_CHANGES']),
      comment: z.string().min(2).optional()
    });

    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const loaded = await loadSessionWithAccess(id, user.id);
    if ('error' in loaded) {
      if (loaded.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
      } else {
        reply.code(403).send({ error: 'Not authorized for this session.' });
      }
      return;
    }

    const { session } = loaded;
    if (session.status !== 'VOTING_V1' && session.status !== 'VOTING_V2') {
      reply.code(400).send({ error: `Session status is ${session.status}` });
      return;
    }

    const activeProposal = session.proposals[0];
    if (!activeProposal) {
      reply.code(400).send({ error: 'No proposal available for voting.' });
      return;
    }

    try {
      await retryOnSessionConflict(() =>
        prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const current = await loadSessionWithAccess(id, user.id, tx);
          if ('error' in current) {
            throw new Error(VOTE_TARGET_CHANGED_MESSAGE);
          }

          if (current.session.status !== session.status) {
            throw new Error(VOTE_TARGET_CHANGED_MESSAGE);
          }

          const currentProposal = current.session.proposals[0] ?? null;
          if (!currentProposal || currentProposal.id !== activeProposal.id) {
            throw new Error(VOTE_TARGET_CHANGED_MESSAGE);
          }

          await touchParticipant(tx, session.id, user.id);
          await upsertStoredVote(tx, {
            proposalId: currentProposal.id,
            userId: user.id,
            value: body.value,
            ...(body.comment !== undefined ? { comment: body.comment } : {})
          });
          await createSessionEvent(tx, {
            sessionId: session.id,
            actor: 'USER',
            actorUserId: user.id,
            eventType: 'VOTE_SUBMITTED',
            payload: {
              proposalId: currentProposal.id,
              proposalVersion: currentProposal.version,
              value: body.value,
              hasComment: Boolean(body.comment),
              commentLength: body.comment?.length ?? 0
            }
          });
          await touchParticipant(tx, session.id, user.id);
        })
      );
    } catch (error) {
      if (isVoteTargetChanged(error)) {
        reply.code(409).send({ error: VOTE_TARGET_CHANGED_MESSAGE });
        return;
      }

      throw error;
    }

    const refreshedAfterVote = await loadSessionWithAccess(id, user.id);
    if ('error' in refreshedAfterVote) {
      reply.code(500).send({ error: 'Unable to refresh session.' });
      return;
    }

    const refreshedRoom = buildRoomPayload(refreshedAfterVote.session, user.id);
    const refreshedProposal = refreshedRoom?.proposal;
    const votes = refreshedProposal?.votes ?? [];
    const participantIds = new Set(
      refreshedAfterVote.session.participants
        .filter((item) => item.consentStatus === 'ACCEPTED')
        .map((item) => item.userId)
    );
    const allVoted = participantIds.size > 0 && votes.length >= participantIds.size;
    const allYes = votes.every((vote) => vote.value === 'YES');
    const currentStatus = refreshedAfterVote.session.status;
    const currentProposal = refreshedAfterVote.session.proposals[0] ?? null;

    try {
      if (allVoted && currentStatus === 'VOTING_V1' && currentProposal) {
        if (allYes) {
          await transitionSession(session.id, SESSION_EVENT.VOTE_ALL_YES, {
            actor: 'SYSTEM',
            actorUserId: user.id,
            payload: {
              proposalId: currentProposal.id,
              proposalVersion: currentProposal.version
            }
          });
        } else {
          const refined = await refineResolutionV2({
            proposalV1: {
              title: currentProposal.title,
              bullets: Array.isArray(currentProposal.bulletPoints)
                ? (currentProposal.bulletPoints as string[])
                : [],
              acceptanceCriteria: Array.isArray(currentProposal.acceptanceCriteria)
                ? (currentProposal.acceptanceCriteria as string[])
                : []
            },
            votes: votes.map((vote) => ({
              userId: vote.userId,
              value: vote.value,
              ...(vote.comment !== null && vote.comment !== undefined ? { comment: vote.comment } : {})
            }))
          });

          if (refined.safetyFlag.flagged) {
            await transitionSession(session.id, SESSION_EVENT.SAFETY_ABORT, {
              actor: 'CAT',
              actorUserId: user.id,
              payload: {
                source: 'refine_resolution_v2',
                reason: refined.safetyFlag.reason ?? 'safety_flagged'
              }
            });
            publishSessionUpdate(session.id, 'safety_abort');
            const refreshed = await loadSessionWithAccess(id, user.id);
            if ('error' in refreshed) {
              reply.code(500).send({ error: 'Unable to refresh session.' });
              return;
            }
            reply.send(buildRoomPayload(refreshed.session, user.id));
            return;
          }

          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await createSessionEvent(tx, {
              sessionId: session.id,
              actor: 'SYSTEM',
              actorUserId: user.id,
              eventType: SESSION_EVENT.VOTE_NEEDS_CHANGES,
              sessionEventType: SESSION_EVENT.VOTE_NEEDS_CHANGES,
              payload: {
                proposalId: currentProposal.id,
                proposalVersion: currentProposal.version
              }
            });

            await tx.proposal.create({
              data: {
                sessionId: session.id,
                version: currentProposal.version + 1,
                title: refined.proposal.title,
                bulletPoints: refined.proposal.bullets,
                acceptanceCriteria: refined.proposal.acceptanceCriteria
              }
            });

            await createStoredMessage(tx, {
              sessionId: session.id,
              visibility: 'SYSTEM',
              kind: 'CAT_PROPOSAL',
              content: `Proposal v${currentProposal.version + 1} refined: ${refined.proposal.title}`
            });

            await createSessionEvent(tx, {
              sessionId: session.id,
              actor: 'CAT',
              actorUserId: user.id,
              eventType: 'PROPOSAL_V2_CREATED',
              payload: {
                version: currentProposal.version + 1,
                bulletCount: refined.proposal.bullets.length,
                acceptanceCriteriaCount: refined.proposal.acceptanceCriteria.length,
                changeLogCount: refined.changeLog.length
              }
            });

            await createSessionEvent(tx, {
              sessionId: session.id,
              actor: 'CAT',
              actorUserId: user.id,
              eventType: SESSION_EVENT.REFINEMENT_DONE,
              sessionEventType: SESSION_EVENT.REFINEMENT_DONE,
              payload: {
                version: currentProposal.version + 1
              }
            });

            await createSessionEvent(tx, {
              sessionId: session.id,
              actor: 'CAT',
              actorUserId: user.id,
              eventType: SESSION_EVENT.PROPOSAL_V2_READY,
              sessionEventType: SESSION_EVENT.PROPOSAL_V2_READY,
              payload: {
                version: currentProposal.version + 1
              }
            });

            await touchParticipant(tx, session.id, user.id);
          });
        }
      }

      if (allVoted && currentStatus === 'VOTING_V2' && currentProposal) {
        if (allYes) {
          await transitionSession(session.id, SESSION_EVENT.VOTE_ALL_YES, {
            actor: 'SYSTEM',
            actorUserId: user.id,
            payload: {
              proposalId: currentProposal.id,
              proposalVersion: currentProposal.version
            }
          });
        } else {
          await transitionSession(session.id, SESSION_EVENT.VOTE_NOT_AGREED, {
            actor: 'SYSTEM',
            actorUserId: user.id,
            payload: {
              proposalId: currentProposal.id,
              proposalVersion: currentProposal.version
            }
          });
        }
      }

      if (allVoted && allYes && currentProposal) {
        await appendCloseoutMessage({
          sessionId: session.id,
          actorUserId: user.id,
          sessionSummary: [
            `Topic: ${session.topic}`,
            `Outcome: agreement reached`,
            `Proposal: ${currentProposal.title}`,
            ...(
              Array.isArray(currentProposal.bulletPoints)
                ? (currentProposal.bulletPoints as string[]).map((bullet) => `- ${bullet}`)
                : []
            )
          ].join('\n'),
          blockers: []
        });
      }

      if (allVoted && currentStatus === 'VOTING_V2' && !allYes && currentProposal) {
        await appendCloseoutMessage({
          sessionId: session.id,
          actorUserId: user.id,
          sessionSummary: [
            `Topic: ${session.topic}`,
            `Outcome: closed without agreement`,
            `Proposal: ${currentProposal.title}`
          ].join('\n'),
          blockers: votes
            .map((vote) => vote.comment)
            .filter((comment): comment is string => Boolean(comment))
        });
      }
    } catch (error) {
      if (
        !isSessionRevisionConflict(error) &&
        !isUniqueConstraintError(error, ['sessionId', 'version'])
      ) {
        throw error;
      }
    }

    const refreshed = await loadSessionWithAccess(id, user.id);
    if ('error' in refreshed) {
      reply.code(500).send({ error: 'Unable to refresh session.' });
      return;
    }

    publishSessionUpdate(session.id, 'vote_updated');
    reply.send(buildRoomPayload(refreshed.session, user.id));
  });

  server.post('/sessions/:id/message', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      content: z.string().min(2),
      previewId: z.string().uuid(),
      approvalToken: z.string().min(20),
      clientMessageId: z.string().uuid(),
      deliveryChannel: deliveryChannelSchema.optional()
    });

    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    const approval = verifyMessageApprovalToken(body.approvalToken);

    if (
      approval.previewId !== body.previewId ||
      approval.sessionId !== id ||
      approval.userId !== user.id ||
      approval.content.trim() !== body.content.trim()
    ) {
      reply.code(400).send({ error: 'The approval token no longer matches this draft.' });
      return;
    }

    if (approval.moderatedText.trim().length < 2) {
      reply.code(400).send({ error: 'This preview is not approved for sending.' });
      return;
    }

    const result = await storeApprovedMediatedMessage({
      sessionId: id,
      userId: user.id,
      clientMessageId: body.previewId,
      deliveryChannel: body.deliveryChannel ?? 'IN_APP',
      expectedSessionRevision: approval.sessionRevision,
      preview: {
        previewId: body.previewId,
        sessionRevision: approval.sessionRevision,
        rawText: approval.content,
        moderatedText: approval.moderatedText,
        recipientView: approval.recipientView,
        coachNote: approval.coachNote,
        latestOtherSummary: approval.latestOtherSummary,
        latestMediatorPrompt: approval.latestMediatorPrompt,
        approvalChecklist: approval.approvalChecklist,
        followUpQuestion: approval.followUpQuestion
      },
      source: 'MESSAGE'
    });

    if ('error' in result) {
      if (result.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
        return;
      }
      if (result.error === 'forbidden') {
        reply.code(403).send({ error: 'Not authorized for this session.' });
        return;
      }
      if (result.error === 'consent_required') {
        reply.code(403).send({ error: 'Consent required before continuing.' });
        return;
      }
      if (result.error === 'invalid_state') {
        reply.code(400).send({ error: `Session status is ${result.status}` });
        return;
      }
      if (result.error === 'stale_preview') {
        reply.code(409).send({ error: 'The room changed. Refresh the mediator preview and try again.' });
        return;
      }
      reply.code(400).send({ error: 'Unable to submit intake.' });
      return;
    }

    reply.send(result.room);
  });

  server.post('/sessions/:id/message-preview', async (request, reply) => {
    const user = await requireAuth(request);
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      content: z.string().min(2)
    });

    const { id } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await previewMediatedMessage(id, user.id, body.content);

    if ('error' in result) {
      if (result.error === 'not_found') {
        reply.code(404).send({ error: 'Session not found' });
        return;
      }
      if (result.error === 'forbidden') {
        reply.code(403).send({ error: 'Not authorized for this session.' });
        return;
      }
      if (result.error === 'consent_required') {
        reply.code(403).send({ error: 'Consent required before continuing.' });
        return;
      }
      if (result.error === 'invalid_state') {
        reply.code(400).send({ error: `Session status is ${result.status}` });
        return;
      }
      reply.code(400).send({ error: 'Unable to preview message.' });
      return;
    }

    reply.send(result);
  });

  server.get('/invites/:token', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const { token } = paramsSchema.parse(request.params);

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { session: true }
    });

    if (!invite) {
      reply.code(404).send({ error: 'Invite not found.' });
      return;
    }

    if (invite.expiresAt < new Date()) {
      if (invite.status !== 'EXPIRED' && invite.session.status === 'INVITED') {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.invite.update({
            where: { id: invite.id },
            data: { status: 'EXPIRED', expiredAt: new Date() }
          });
          await createSessionEvent(tx, {
            sessionId: invite.sessionId,
            actor: 'SYSTEM',
            eventType: SESSION_EVENT.INVITE_EXPIRED,
            sessionEventType: SESSION_EVENT.INVITE_EXPIRED,
            payload: {
              inviteId: invite.id,
              expiresAt: invite.expiresAt.toISOString()
            }
          });
        });
      } else if (invite.status !== 'EXPIRED') {
        await prisma.invite.update({
          where: { id: invite.id },
          data: { status: 'EXPIRED', expiredAt: new Date() }
        });
      }
      publishSessionUpdate(invite.sessionId, 'invite_expired');
      reply.code(410).send({ error: 'Invite expired.' });
      return;
    }

    let inviteStatus = invite.status;
    if (invite.status === 'SENT') {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.invite.update({
          where: { id: invite.id },
          data: { status: 'OPENED', openedAt: new Date() }
        });
        await createSessionEvent(tx, {
          sessionId: invite.sessionId,
          actor: 'SYSTEM',
          eventType: 'INVITE_OPENED',
          payload: {
            inviteId: invite.id
          }
        });
      });
      inviteStatus = 'OPENED';
      publishSessionUpdate(invite.sessionId, 'invite_opened');
    }

    reply.send({
      token: invite.token,
      status: inviteStatus,
      inviteeEmailOrPhone: invite.inviteeEmailOrPhone,
      deliveryChannel: invite.deliveryChannel,
      inviteUrl: buildInviteUrl(invite.token),
      session: {
        id: invite.sessionId,
        topic: invite.session.topic,
        status: invite.session.status
      }
    });
  });

  server.post('/invites/:token/accept', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const bodySchema = z.object({
      email: z.string().email(),
      displayName: z.string().min(2),
      password: z.string().min(8)
    });

    const { token } = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { session: { include: { relationship: true } } }
    });

    if (!invite) {
      reply.code(404).send({ error: 'Invite not found.' });
      return;
    }

    if (invite.status !== 'SENT' && invite.status !== 'OPENED') {
      reply.code(400).send({ error: 'Invite is not active.' });
      return;
    }

    if (invite.expiresAt < new Date()) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.invite.update({
          where: { id: invite.id },
          data: { status: 'EXPIRED', expiredAt: new Date() }
        });
        if (invite.session.status === 'INVITED') {
          await createSessionEvent(tx, {
            sessionId: invite.sessionId,
            actor: 'SYSTEM',
            eventType: SESSION_EVENT.INVITE_EXPIRED,
            sessionEventType: SESSION_EVENT.INVITE_EXPIRED,
            payload: {
              inviteId: invite.id,
              expiresAt: invite.expiresAt.toISOString()
            }
          });
        }
      });
      publishSessionUpdate(invite.sessionId, 'invite_expired');
      reply.code(410).send({ error: 'Invite expired.' });
      return;
    }

    if (invite.session.status !== 'INVITED') {
      reply.code(400).send({ error: `Session status is ${invite.session.status}` });
      return;
    }

    if (invite.inviteeEmailOrPhone.includes('@')) {
      const normalizedInvite = invite.inviteeEmailOrPhone.toLowerCase();
      if (normalizedInvite !== body.email.toLowerCase()) {
        reply.code(400).send({ error: 'This invite was sent to a different email.' });
        return;
      }
    }

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    let user = existingUser;

    if (existingUser) {
      const valid = await verifyPassword(body.password, existingUser.passwordHash);
      if (!valid) {
        reply.code(401).send({ error: 'Invalid credentials for this email.' });
        return;
      }
    } else {
      user = await prisma.user.create({
        data: {
          email: body.email,
          displayName: body.displayName,
          passwordHash: await hashPassword(body.password)
        }
      });

      await prisma.userPlan.create({
        data: {
          userId: user.id,
          plan: 'FREE'
        }
      });
    }

    if (!user) {
      reply.code(500).send({ error: 'Unable to create user.' });
      return;
    }

    if (invite.session.relationship.participantAUserId === user.id) {
      reply.code(400).send({ error: 'This invite cannot be accepted by the initiator account.' });
      return;
    }

    const existingParticipant = await prisma.participant.findFirst({
      where: {
        sessionId: invite.sessionId,
        userId: user.id
      }
    });

    if (existingParticipant) {
      reply.code(409).send({ error: 'This user is already part of the room.' });
      return;
    }

    const updatedSession = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() }
      });
      await tx.relationship.update({
        where: { id: invite.session.relationshipId },
        data: { participantBUserId: user.id }
      });
      await tx.participant.create({
        data: {
          sessionId: invite.sessionId,
          userId: user.id,
          role: 'INVITEE',
          consentStatus: 'ACCEPTED'
        }
      });
      await touchParticipant(tx, invite.sessionId, user.id);

      return createSessionEvent(tx, {
        sessionId: invite.sessionId,
        actor: 'USER',
        actorUserId: user.id,
        eventType: SESSION_EVENT.INVITE_ACCEPTED,
        sessionEventType: SESSION_EVENT.INVITE_ACCEPTED,
        payload: {
          inviteId: invite.id,
          inviteeEmail: user.email
        }
      });
    });

    publishSessionUpdate(invite.sessionId, 'invite_accepted');

    reply.send({
      session: updatedSession,
      token: signToken(user.id),
      user: { id: user.id, email: user.email, displayName: user.displayName }
    });
  });

  server.post('/invites/:token/decline', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const { token } = paramsSchema.parse(request.params);

    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { session: true }
    });
    if (!invite) {
      reply.code(404).send({ error: 'Invite not found.' });
      return;
    }

    if (invite.status !== 'SENT' && invite.status !== 'OPENED') {
      reply.code(400).send({ error: 'Invite is not active.' });
      return;
    }

    if (invite.session.status !== 'INVITED') {
      reply.code(400).send({ error: `Session status is ${invite.session.status}` });
      return;
    }

    const updatedSession = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'DECLINED', declinedAt: new Date() }
      });

      return createSessionEvent(tx, {
        sessionId: invite.sessionId,
        actor: 'SYSTEM',
        eventType: SESSION_EVENT.INVITE_DECLINED,
        sessionEventType: SESSION_EVENT.INVITE_DECLINED,
        payload: {
          inviteId: invite.id
        }
      });
    });

    publishSessionUpdate(invite.sessionId, 'invite_declined');
    reply.send({ session: updatedSession });
  });

  return server;
}
