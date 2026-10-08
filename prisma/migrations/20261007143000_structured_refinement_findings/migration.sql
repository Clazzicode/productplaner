CREATE TABLE "RefinementFinding" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "initiativeId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'open',
  "ownerUserId" TEXT,
  "resolution" TEXT NOT NULL DEFAULT '',
  "sourceAiAssistItemId" TEXT,
  "createdByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RefinementFinding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefinementFinding_sourceType_check" CHECK ("sourceType" IN ('manual', 'ai', 'deterministic')),
  CONSTRAINT "RefinementFinding_category_check" CHECK ("category" IN ('missing_information', 'engineering_question', 'contradiction', 'dependency', 'scope', 'acceptance_criteria', 'blocker', 'other')),
  CONSTRAINT "RefinementFinding_status_check" CHECK ("status" IN ('open', 'resolved', 'dismissed')),
  CONSTRAINT "RefinementFinding_resolved_check" CHECK ("status" <> 'resolved' OR length(trim("resolution")) > 0),
  CONSTRAINT "RefinementFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RefinementFinding_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefinementFinding_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefinementFinding_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RefinementFinding_sourceAiAssistItemId_fkey" FOREIGN KEY ("sourceAiAssistItemId") REFERENCES "AiAssistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "RefinementFinding_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RefinementFinding_sourceAiAssistItemId_key" ON "RefinementFinding"("sourceAiAssistItemId");
CREATE INDEX "RefinementFinding_organizationId_initiativeId_status_idx" ON "RefinementFinding"("organizationId", "initiativeId", "status");
CREATE INDEX "RefinementFinding_storyId_status_idx" ON "RefinementFinding"("storyId", "status");
CREATE INDEX "RefinementFinding_ownerUserId_status_idx" ON "RefinementFinding"("ownerUserId", "status");

ALTER TABLE "RefinementFinding" ENABLE ROW LEVEL SECURITY;

CREATE POLICY refinement_finding_all ON "RefinementFinding" FOR ALL TO app_rw, authenticated
  USING (is_org_member("RefinementFinding"."organizationId"))
  WITH CHECK (
    is_org_member("RefinementFinding"."organizationId")
    AND EXISTS (
      SELECT 1 FROM "Initiative" i
      WHERE i.id = "RefinementFinding"."initiativeId"
        AND i."organizationId" = "RefinementFinding"."organizationId"
    )
    AND EXISTS (
      SELECT 1
      FROM "ArtifactLayer" a
      JOIN "Prototype" p ON p.id = a."prototypeId"
      WHERE a.id = "RefinementFinding"."storyId"
        AND a.type = 'story'
        AND p."initiativeId" = "RefinementFinding"."initiativeId"
    )
  );

-- Prisma is the primary data path, but explicit grants keep this table
-- compatible with Supabase's 2026 opt-in Data API exposure behavior.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "RefinementFinding" TO authenticated;
