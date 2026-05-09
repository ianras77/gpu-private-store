CREATE TABLE "LibraryTrackInsight" (
    "canonicalKey" TEXT NOT NULL,
    "trackId" TEXT,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "year" INTEGER,
    "summary" TEXT NOT NULL,
    "artistContext" TEXT NOT NULL,
    "trackContext" TEXT NOT NULL,
    "setHook" TEXT NOT NULL,
    "listenFor" TEXT NOT NULL,
    "requestTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sonicSignatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "funFacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "boothMemories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embeddingText" TEXT NOT NULL,
    "embeddingModel" TEXT,
    "embedding" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "source" TEXT NOT NULL DEFAULT 'heuristic',
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "refinementCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "lastAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryTrackInsight_pkey" PRIMARY KEY ("canonicalKey")
);

CREATE INDEX "LibraryTrackInsight_trackId_idx" ON "LibraryTrackInsight"("trackId");
CREATE INDEX "LibraryTrackInsight_artist_title_idx" ON "LibraryTrackInsight"("artist", "title");
CREATE INDEX "LibraryTrackInsight_updatedAt_idx" ON "LibraryTrackInsight"("updatedAt");
