ALTER TABLE "ArtifactRevision"
ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;
