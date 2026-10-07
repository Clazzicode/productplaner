ALTER TABLE "ArtifactLayer"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'generated',
  ADD COLUMN "readinessStatus" TEXT NOT NULL DEFAULT 'needs_refinement',
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedByUserId" TEXT;

ALTER TABLE "ArtifactLayer"
  ADD CONSTRAINT "ArtifactLayer_sourceType_check"
    CHECK ("sourceType" IN ('generated', 'manual', 'jira', 'ai', 'split')),
  ADD CONSTRAINT "ArtifactLayer_readinessStatus_check"
    CHECK ("readinessStatus" IN ('needs_refinement', 'ready_for_refinement', 'sprint_ready', 'blocked', 'split')),
  ADD CONSTRAINT "ArtifactLayer_jira_source_reference_check"
    CHECK ("sourceType" <> 'jira' OR "externalRef" IS NOT NULL),
  ADD CONSTRAINT "ArtifactLayer_approval_type_check"
    CHECK ("approvedAt" IS NULL OR "type" = 'acceptance_criterion');

CREATE UNIQUE INDEX "ArtifactLayer_prototypeId_type_dedupeKey_key"
  ON "ArtifactLayer"("prototypeId", "type", "dedupeKey");
CREATE UNIQUE INDEX "ArtifactLayer_prototypeId_type_externalRef_key"
  ON "ArtifactLayer"("prototypeId", "type", "externalRef");

CREATE TABLE "ArtifactRevision" (
  "id" TEXT NOT NULL,
  "artifactId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtifactRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArtifactRevision_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ArtifactRevision_artifactId_version_key" ON "ArtifactRevision"("artifactId", "version");
CREATE INDEX "ArtifactRevision_artifactId_createdAt_idx" ON "ArtifactRevision"("artifactId", "createdAt");

ALTER TABLE "ArtifactRevision" ENABLE ROW LEVEL SECURITY;

CREATE POLICY artifact_revision_all ON "ArtifactRevision" FOR ALL TO app_rw, authenticated
  USING (EXISTS (
    SELECT 1
    FROM "ArtifactLayer" a
    JOIN "Prototype" p ON p.id = a."prototypeId"
    JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE a.id = "ArtifactRevision"."artifactId"
      AND is_org_member(i."organizationId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM "ArtifactLayer" a
    JOIN "Prototype" p ON p.id = a."prototypeId"
    JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE a.id = "ArtifactRevision"."artifactId"
      AND is_org_member(i."organizationId")
  ));
