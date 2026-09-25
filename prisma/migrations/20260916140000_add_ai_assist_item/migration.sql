-- AI Assist foundation (Section 4). Purely additive: one new table
-- (AiAssistItem) plus a nullable AiJob back-reference. Hand-written, same
-- reason as every migration since add_project_layer_step_a (prisma migrate
-- dev/diff both fail on platform_admins's cross-schema FK to auth.users).

-- CreateTable
CREATE TABLE "AiAssistItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "actionKey" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesItemId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "aiJobId" TEXT,
    "aiModelUsed" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "informationUsed" TEXT NOT NULL DEFAULT '',
    "why" TEXT NOT NULL DEFAULT '',
    "impact" TEXT NOT NULL DEFAULT '',
    "assumptionsJson" TEXT NOT NULL DEFAULT '[]',
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "rulesAppliedJson" TEXT NOT NULL DEFAULT '[]',
    "proposedContentJson" TEXT NOT NULL DEFAULT '{}',
    "appliedByUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedValueJson" TEXT,
    "appliedEntityType" TEXT,
    "appliedEntityId" TEXT,
    "dismissedByUserId" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "dismissReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAssistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiAssistItem_initiativeId_actionKey_targetType_targetId_status_idx" ON "AiAssistItem"("initiativeId", "actionKey", "targetType", "targetId", "status");
CREATE INDEX "AiAssistItem_projectId_actionKey_status_idx" ON "AiAssistItem"("projectId", "actionKey", "status");
CREATE INDEX "AiAssistItem_organizationId_actionKey_createdAt_idx" ON "AiAssistItem"("organizationId", "actionKey", "createdAt");
CREATE INDEX "AiAssistItem_aiJobId_idx" ON "AiAssistItem"("aiJobId");

-- AddForeignKey (mirrors Document/ContextItem/AiJob's exact onDelete conventions)
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_supersedesItemId_fkey" FOREIGN KEY ("supersedesItemId") REFERENCES "AiAssistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_appliedByUserId_fkey" FOREIGN KEY ("appliedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiAssistItem" ADD CONSTRAINT "AiAssistItem_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: direct organizationId check, matching Document/ContextItem/AiJob exactly.
-- SELECT/INSERT/UPDATE (not a single FOR ALL) since — like AiJob, unlike the
-- write-once AiUsageEvent — a row's status/appliedAt/dismissedAt/etc. are
-- updated over its lifecycle. No DELETE policy: items are superseded/
-- dismissed, never removed by application code.
ALTER TABLE "AiAssistItem" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_assist_item_select ON "AiAssistItem" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));

CREATE POLICY ai_assist_item_insert ON "AiAssistItem" FOR INSERT TO app_rw, authenticated
  WITH CHECK (is_org_member("organizationId"));

CREATE POLICY ai_assist_item_update ON "AiAssistItem" FOR UPDATE TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

-- AlterTable: AiJob's reverse side of AiAssistItem.aiJobId is virtual
-- (Prisma-only, no column) — nothing to add on AiJob itself.
