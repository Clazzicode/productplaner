ALTER TABLE "RefinementFinding"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "dedupeKey" TEXT,
  ADD COLUMN "followUpNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "followUpAt" TIMESTAMP(3),
  ADD CONSTRAINT "RefinementFinding_revision_check" CHECK ("revision" > 0);

CREATE INDEX "RefinementFinding_storyId_dedupeKey_status_idx"
  ON "RefinementFinding"("storyId", "dedupeKey", "status");

-- Only one unresolved instance of the same deterministic/AI observation may
-- exist for a story. Resolved or dismissed findings remain immutable history
-- and do not block the same concern from being raised after later changes.
CREATE UNIQUE INDEX "RefinementFinding_open_dedupe_key"
  ON "RefinementFinding"("storyId", "dedupeKey")
  WHERE "status" = 'open' AND "dedupeKey" IS NOT NULL;

CREATE TABLE "RefinementFindingRevision" (
  "id" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "fromRevision" INTEGER NOT NULL,
  "toRevision" INTEGER NOT NULL,
  "previousData" JSONB NOT NULL,
  "nextData" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefinementFindingRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefinementFindingRevision_revision_check" CHECK (
    "fromRevision" > 0 AND "toRevision" = "fromRevision" + 1
  ),
  CONSTRAINT "RefinementFindingRevision_reason_check" CHECK (length(trim("reason")) >= 3),
  CONSTRAINT "RefinementFindingRevision_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "RefinementFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefinementFindingRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RefinementFindingRevision_findingId_toRevision_key"
  ON "RefinementFindingRevision"("findingId", "toRevision");
CREATE INDEX "RefinementFindingRevision_actorUserId_createdAt_idx"
  ON "RefinementFindingRevision"("actorUserId", "createdAt");

ALTER TABLE "RefinementFindingRevision" ENABLE ROW LEVEL SECURITY;

CREATE POLICY refinement_finding_revision_select ON "RefinementFindingRevision"
  FOR SELECT TO app_rw, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "RefinementFinding" f
      WHERE f.id = "RefinementFindingRevision"."findingId"
        AND is_org_member(f."organizationId")
    )
  );

CREATE POLICY refinement_finding_revision_insert ON "RefinementFindingRevision"
  FOR INSERT TO app_rw, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "RefinementFinding" f
      WHERE f.id = "RefinementFindingRevision"."findingId"
        AND is_org_member(f."organizationId")
    )
  );

GRANT SELECT, INSERT ON TABLE "RefinementFindingRevision" TO authenticated;
