-- AlterTable
ALTER TABLE "MediationSession"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stateSnapshot" JSONB,
ADD COLUMN "lastEventAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actor" "AuditActor" NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "previousStatus" "SessionStatus",
    "nextStatus" "SessionStatus",
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionEvent_sessionId_sequence_key" ON "SessionEvent"("sessionId", "sequence");

-- AddForeignKey
ALTER TABLE "SessionEvent"
ADD CONSTRAINT "SessionEvent_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "MediationSession"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent"
ADD CONSTRAINT "SessionEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
