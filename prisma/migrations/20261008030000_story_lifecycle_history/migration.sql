ALTER TABLE "ArtifactRevision"
ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;
