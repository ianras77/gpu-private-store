-- Add storyteller profiles, avatar images, anonymous story publishing, and image purpose metadata.
CREATE TYPE "ImagePurpose" AS ENUM ('STORY', 'AVATAR');

ALTER TABLE "User"
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "avatarImageId" TEXT;

ALTER TABLE "Tale"
  ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "storyPrompt" TEXT;

ALTER TABLE "ImageAsset"
  ADD COLUMN "purpose" "ImagePurpose" NOT NULL DEFAULT 'STORY';

CREATE UNIQUE INDEX "User_avatarImageId_key" ON "User"("avatarImageId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_avatarImageId_fkey"
  FOREIGN KEY ("avatarImageId") REFERENCES "ImageAsset"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
