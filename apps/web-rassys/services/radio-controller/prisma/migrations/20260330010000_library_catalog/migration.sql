-- CreateTable
CREATE TABLE "LibraryTrack" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "relativePath" TEXT,
    "sourceKind" TEXT NOT NULL DEFAULT 'music',
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "albumArtUrl" TEXT,
    "hasArtwork" BOOLEAN NOT NULL DEFAULT false,
    "year" INTEGER,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duration" INTEGER,
    "bpm" INTEGER,
    "energy" DOUBLE PRECISION NOT NULL,
    "moodTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" TEXT,
    "sampleRate" INTEGER,
    "bitsPerSample" INTEGER,
    "bitrate" INTEGER,
    "lossless" BOOLEAN,
    "scanToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibrarySnippet" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "relativePath" TEXT,
    "label" TEXT NOT NULL,
    "duration" INTEGER,
    "format" TEXT,
    "sourceKind" TEXT NOT NULL DEFAULT 'dj',
    "scanToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibrarySnippet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryPodcastSeries" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hasArtwork" BOOLEAN NOT NULL DEFAULT false,
    "episodeCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scanToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "indexedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryPodcastSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryPodcastEpisode" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "seriesTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "duration" INTEGER,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "episodeNumber" INTEGER,
    "seasonNumber" INTEGER,
    "hasArtwork" BOOLEAN NOT NULL DEFAULT false,
    "fileSize" BIGINT,
    "format" TEXT,
    "sampleRate" INTEGER,
    "bitsPerSample" INTEGER,
    "bitrate" INTEGER,
    "lossless" BOOLEAN,
    "scanToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryPodcastEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryScanState" (
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "activeToken" TEXT,
    "pendingToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "itemCount" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryScanState_pkey" PRIMARY KEY ("scope")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryTrack_path_key" ON "LibraryTrack"("path");

-- CreateIndex
CREATE INDEX "LibraryTrack_artist_album_title_idx" ON "LibraryTrack"("artist", "album", "title");

-- CreateIndex
CREATE INDEX "LibraryTrack_sourceKind_artist_idx" ON "LibraryTrack"("sourceKind", "artist");

-- CreateIndex
CREATE INDEX "LibraryTrack_scanToken_idx" ON "LibraryTrack"("scanToken");

-- CreateIndex
CREATE UNIQUE INDEX "LibrarySnippet_path_key" ON "LibrarySnippet"("path");

-- CreateIndex
CREATE INDEX "LibrarySnippet_label_idx" ON "LibrarySnippet"("label");

-- CreateIndex
CREATE INDEX "LibrarySnippet_scanToken_idx" ON "LibrarySnippet"("scanToken");

-- CreateIndex
CREATE INDEX "LibraryPodcastSeries_scanToken_updatedAt_idx" ON "LibraryPodcastSeries"("scanToken", "updatedAt");

-- CreateIndex
CREATE INDEX "LibraryPodcastSeries_slug_idx" ON "LibraryPodcastSeries"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryPodcastEpisode_path_key" ON "LibraryPodcastEpisode"("path");

-- CreateIndex
CREATE INDEX "LibraryPodcastEpisode_seriesId_seasonNumber_episodeNumber_relative_idx" ON "LibraryPodcastEpisode"("seriesId", "seasonNumber", "episodeNumber", "relativePath");

-- CreateIndex
CREATE INDEX "LibraryPodcastEpisode_scanToken_idx" ON "LibraryPodcastEpisode"("scanToken");

-- AddForeignKey
ALTER TABLE "LibraryPodcastEpisode" ADD CONSTRAINT "LibraryPodcastEpisode_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "LibraryPodcastSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
