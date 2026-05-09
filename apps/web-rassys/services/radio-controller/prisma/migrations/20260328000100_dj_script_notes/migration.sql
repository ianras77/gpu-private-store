ALTER TABLE "DjScript"
ADD COLUMN "reason" TEXT,
ADD COLUMN "eventType" TEXT,
ADD COLUMN "trackIds" JSONB,
ADD COLUMN "setlist" JSONB,
ADD COLUMN "currentTrack" JSONB;
