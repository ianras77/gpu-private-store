-- CreateTable
CREATE TABLE "LibraryTrackArtwork" (
    "trackId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'local',
    "sourceUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryTrackArtwork_pkey" PRIMARY KEY ("trackId")
);

-- CreateIndex
CREATE INDEX "LibraryTrackArtwork_updatedAt_idx" ON "LibraryTrackArtwork"("updatedAt");

-- AddForeignKey
ALTER TABLE "LibraryTrackArtwork" ADD CONSTRAINT "LibraryTrackArtwork_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "LibraryTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
