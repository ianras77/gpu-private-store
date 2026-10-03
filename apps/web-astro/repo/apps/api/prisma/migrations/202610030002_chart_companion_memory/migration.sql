ALTER TABLE "AstroConversation"
ADD COLUMN IF NOT EXISTS "messages" JSONB NOT NULL DEFAULT '[]'::jsonb;
