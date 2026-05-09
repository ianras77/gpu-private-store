ALTER TABLE "DjScript"
ADD COLUMN "boothSignature" TEXT,
ADD COLUMN "boothDossier" JSONB;

CREATE INDEX "DjScript_boothSignature_idx" ON "DjScript"("boothSignature");
