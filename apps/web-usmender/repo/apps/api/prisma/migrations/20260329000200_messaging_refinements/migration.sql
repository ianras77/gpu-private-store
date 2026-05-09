ALTER TABLE "MediationTurn"
ADD COLUMN "eventSequence" INTEGER;

CREATE INDEX "MediationTurn_sessionId_eventSequence_idx"
ON "MediationTurn"("sessionId", "eventSequence");
