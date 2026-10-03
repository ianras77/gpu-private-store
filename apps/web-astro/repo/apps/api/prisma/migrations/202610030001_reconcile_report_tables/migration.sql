-- The recorded 202609050001 migration exists in production, but its report
-- tables are absent there. Recreate the additive tables idempotently so a
-- recorded migration cannot leave report and companion routes without storage.
CREATE TABLE IF NOT EXISTS "ReportRun" (
  "id" TEXT NOT NULL,
  "userId" UUID,
  "chartProfileId" TEXT,
  "brandId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "depth" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT,
  "inputHash" TEXT NOT NULL,
  "inputJson" JSONB NOT NULL,
  "workflowVersion" TEXT NOT NULL,
  "traceId" TEXT,
  "errorClass" TEXT,
  "errorMessage" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReportSection" (
  "id" TEXT NOT NULL,
  "reportRunId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "payload" JSONB,
  "factRefs" JSONB,
  "loreRefs" JSONB,
  "modelProfile" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReportArtifact" (
  "id" TEXT NOT NULL,
  "reportRunId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "reportVersion" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "payload" JSONB NOT NULL,
  "provenance" JSONB,
  "legacyReadingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AstroConversation" (
  "id" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "chartProfileId" TEXT,
  "brandId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "memoryEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AstroConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AstroFeedback" (
  "id" TEXT NOT NULL,
  "userId" UUID,
  "reportRunId" TEXT,
  "sectionKey" TEXT,
  "rating" TEXT NOT NULL,
  "comment" TEXT,
  "workflowVersion" TEXT,
  "brandId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AstroFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReportRun_userId_createdAt_idx" ON "ReportRun"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReportRun_status_createdAt_idx" ON "ReportRun"("status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ReportRun_userId_idempotencyKey_key" ON "ReportRun"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "ReportSection_reportRunId_position_idx" ON "ReportSection"("reportRunId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "ReportSection_reportRunId_sectionKey_key" ON "ReportSection"("reportRunId", "sectionKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ReportArtifact_reportRunId_key" ON "ReportArtifact"("reportRunId");
CREATE UNIQUE INDEX IF NOT EXISTS "AstroConversation_threadId_key" ON "AstroConversation"("threadId");
CREATE INDEX IF NOT EXISTS "AstroConversation_userId_createdAt_idx" ON "AstroConversation"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AstroFeedback_reportRunId_createdAt_idx" ON "AstroFeedback"("reportRunId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportRun_userId_fkey' AND conrelid = '"ReportRun"'::regclass) THEN
    ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportRun_chartProfileId_fkey' AND conrelid = '"ReportRun"'::regclass) THEN
    ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_chartProfileId_fkey" FOREIGN KEY ("chartProfileId") REFERENCES "ChartProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportSection_reportRunId_fkey' AND conrelid = '"ReportSection"'::regclass) THEN
    ALTER TABLE "ReportSection" ADD CONSTRAINT "ReportSection_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReportArtifact_reportRunId_fkey' AND conrelid = '"ReportArtifact"'::regclass) THEN
    ALTER TABLE "ReportArtifact" ADD CONSTRAINT "ReportArtifact_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AstroConversation_userId_fkey' AND conrelid = '"AstroConversation"'::regclass) THEN
    ALTER TABLE "AstroConversation" ADD CONSTRAINT "AstroConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AstroFeedback_userId_fkey' AND conrelid = '"AstroFeedback"'::regclass) THEN
    ALTER TABLE "AstroFeedback" ADD CONSTRAINT "AstroFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AstroFeedback_reportRunId_fkey' AND conrelid = '"AstroFeedback"'::regclass) THEN
    ALTER TABLE "AstroFeedback" ADD CONSTRAINT "AstroFeedback_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
