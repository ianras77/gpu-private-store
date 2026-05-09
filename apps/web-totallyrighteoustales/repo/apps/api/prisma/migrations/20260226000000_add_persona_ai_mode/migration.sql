-- Add persona + assist mode metadata
CREATE TYPE "TaleAssistMode" AS ENUM ('HANDMADE', 'STUDIO');

ALTER TABLE "User"
  ADD COLUMN "personaName" TEXT,
  ADD COLUMN "personaVoice" TEXT,
  ADD COLUMN "personaSignature" TEXT;

ALTER TABLE "Tale"
  ADD COLUMN "assistMode" "TaleAssistMode" NOT NULL DEFAULT 'HANDMADE',
  ADD COLUMN "personaName" TEXT,
  ADD COLUMN "personaVoice" TEXT,
  ADD COLUMN "personaSignature" TEXT;
