import { PrismaClient, PlanType, ParticipantRole, ConsentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const initiator = await prisma.user.upsert({
    where: { email: 'initiator@usmender.dev' },
    update: {
      displayName: 'Avery Lane',
      passwordHash: await bcrypt.hash('password123', 10)
    },
    create: {
      email: 'initiator@usmender.dev',
      displayName: 'Avery Lane',
      passwordHash: await bcrypt.hash('password123', 10)
    }
  });

  await prisma.userPlan.upsert({
    where: { userId: initiator.id },
    update: { plan: PlanType.FREE },
    create: {
      userId: initiator.id,
      plan: PlanType.FREE
    }
  });

  const relationship =
    (await prisma.relationship.findFirst({
      where: {
        createdByUserId: initiator.id,
        participantAUserId: initiator.id,
        label: 'Demo Relationship'
      }
    })) ??
    (await prisma.relationship.create({
      data: {
        createdByUserId: initiator.id,
        label: 'Demo Relationship',
        participantAUserId: initiator.id
      }
    }));

  const session =
    (await prisma.mediationSession.findFirst({
      where: {
        relationshipId: relationship.id,
        createdByUserId: initiator.id,
        topic: 'Shared household cadence'
      }
    })) ??
    (await prisma.mediationSession.create({
      data: {
        relationshipId: relationship.id,
        topic: 'Shared household cadence',
        createdByUserId: initiator.id
      }
    }));

  await prisma.participant.upsert({
    where: {
      sessionId_userId: {
        sessionId: session.id,
        userId: initiator.id
      }
    },
    update: {
      role: ParticipantRole.INITIATOR,
      consentStatus: ConsentStatus.ACCEPTED
    },
    create: {
      sessionId: session.id,
      userId: initiator.id,
      role: ParticipantRole.INITIATOR,
      consentStatus: ConsentStatus.ACCEPTED
    }
  });

  const createdAt = new Date();
  const snapshot = {
    version: 1,
    status: 'DRAFT',
    invite: null,
    participants: [
      {
        userId: initiator.id,
        displayName: initiator.displayName,
        role: 'INITIATOR',
        consentStatus: 'ACCEPTED',
        hasPrivateMessage: false,
        hasSharedPerspective: false,
        lastSeenAt: null
      }
    ],
    intake: {
      privateMessageCount: 0,
      sharedMessageCount: 0,
      complete: false,
      waitingOnUserIds: [initiator.id],
      waitingOnRoles: ['INITIATOR'],
      latestQuestion: null
    },
    proposal: {
      activeProposalId: null,
      activeVersion: null,
      versions: [],
      latestTitle: null,
      latestCreatedAt: null
    },
    voting: {
      activeProposalId: null,
      submittedUserIds: [],
      pendingUserIds: [initiator.id],
      allYes: false,
      values: []
    },
    lastEvent: {
      sequence: 1,
      type: 'SESSION_CREATED',
      actor: 'USER',
      actorUserId: initiator.id,
      at: createdAt.toISOString()
    }
  };

  if (session.revision === 0) {
    await prisma.mediationSession.update({
      where: { id: session.id },
      data: {
        revision: 1,
        stateSnapshot: snapshot,
        lastEventAt: createdAt
      }
    });
  }

  await prisma.sessionEvent.upsert({
    where: {
      sessionId_sequence: {
        sessionId: session.id,
        sequence: 1
      }
    },
    update: {},
    create: {
      sessionId: session.id,
      sequence: 1,
      actor: 'USER',
      actorUserId: initiator.id,
      eventType: 'SESSION_CREATED',
      previousStatus: 'DRAFT',
      nextStatus: 'DRAFT',
      payload: {
        relationshipId: relationship.id,
        topic: session.topic
      },
      createdAt
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
