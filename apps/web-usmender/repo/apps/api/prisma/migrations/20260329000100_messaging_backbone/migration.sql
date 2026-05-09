-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'SMS_LINK', 'EMAIL_LINK', 'IMESSAGE_HANDOFF');

-- CreateEnum
CREATE TYPE "DeliveryAttemptStatus" AS ENUM ('PENDING', 'SIMULATED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryKind" AS ENUM ('INVITE_LINK', 'MESSAGE_NUDGE');

-- CreateEnum
CREATE TYPE "MediatedTurnSource" AS ENUM ('INTAKE', 'MESSAGE');

-- AlterTable
ALTER TABLE "Participant"
ADD COLUMN "lastReadSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Invite"
ADD COLUMN "deliveryChannel" "DeliveryChannel" NOT NULL DEFAULT 'EMAIL_LINK',
ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "declinedAt" TIMESTAMP(3),
ADD COLUMN "expiredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MediationTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "clientMessageId" TEXT NOT NULL,
    "rawMessageId" TEXT NOT NULL,
    "moderatedMessageId" TEXT NOT NULL,
    "source" "MediatedTurnSource" NOT NULL DEFAULT 'MESSAGE',
    "deliveryChannel" "DeliveryChannel" NOT NULL DEFAULT 'IN_APP',
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "inviteId" TEXT,
    "mediatedTurnId" TEXT,
    "kind" "DeliveryKind" NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "DeliveryAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "payload" JSONB,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Participant_sessionId_role_key" ON "Participant"("sessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "MediationTurn_rawMessageId_key" ON "MediationTurn"("rawMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MediationTurn_moderatedMessageId_key" ON "MediationTurn"("moderatedMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MediationTurn_sessionId_authorUserId_clientMessageId_key"
ON "MediationTurn"("sessionId", "authorUserId", "clientMessageId");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_sessionId_kind_createdAt_idx"
ON "DeliveryAttempt"("sessionId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_inviteId_createdAt_idx"
ON "DeliveryAttempt"("inviteId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_mediatedTurnId_createdAt_idx"
ON "DeliveryAttempt"("mediatedTurnId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_one_active_per_session_idx"
ON "Invite"("sessionId")
WHERE "status" IN ('SENT', 'OPENED');

-- AddConstraint
ALTER TABLE "Relationship"
ADD CONSTRAINT "Relationship_distinct_participants"
CHECK ("participantBUserId" IS NULL OR "participantBUserId" <> "participantAUserId");

-- AddForeignKey
ALTER TABLE "MediationTurn"
ADD CONSTRAINT "MediationTurn_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MediationSession"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediationTurn"
ADD CONSTRAINT "MediationTurn_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediationTurn"
ADD CONSTRAINT "MediationTurn_rawMessageId_fkey"
FOREIGN KEY ("rawMessageId") REFERENCES "Message"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediationTurn"
ADD CONSTRAINT "MediationTurn_moderatedMessageId_fkey"
FOREIGN KEY ("moderatedMessageId") REFERENCES "Message"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt"
ADD CONSTRAINT "DeliveryAttempt_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MediationSession"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt"
ADD CONSTRAINT "DeliveryAttempt_inviteId_fkey"
FOREIGN KEY ("inviteId") REFERENCES "Invite"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt"
ADD CONSTRAINT "DeliveryAttempt_mediatedTurnId_fkey"
FOREIGN KEY ("mediatedTurnId") REFERENCES "MediationTurn"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
