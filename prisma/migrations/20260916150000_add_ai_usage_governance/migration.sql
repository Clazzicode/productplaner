-- Section 5 — Memory, Reuse, Token Controls, and Usage Governance. Purely
-- additive: new nullable/defaulted columns and indexes on existing tables,
-- no new tables. Hand-written, same reason as every migration since
-- add_project_layer_step_a (prisma migrate dev/diff both fail on
-- platform_admins's cross-schema FK to auth.users).

-- AiCapability: AI Operation Registry metadata (§5/§24).
ALTER TABLE "AiCapability" ADD COLUMN "maxContextTokens" INTEGER NOT NULL DEFAULT 8000;
ALTER TABLE "AiCapability" ADD COLUMN "requiredContextLayersJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "AiCapability" ADD COLUMN "optionalContextLayersJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "AiCapability" ADD COLUMN "outputType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AiCapability" ADD COLUMN "reusable" BOOLEAN NOT NULL DEFAULT true;

-- AiJob: lightweight, internal-only context-audit trail (§40).
ALTER TABLE "AiJob" ADD COLUMN "contextAuditJson" TEXT;

-- AiUsageEvent: project scoping, model/cache-token/kind/artifact-link fields (§21/§22).
ALTER TABLE "AiUsageEvent" ADD COLUMN "projectId" TEXT;
ALTER TABLE "AiUsageEvent" ADD COLUMN "aiAssistItemId" TEXT;
ALTER TABLE "AiUsageEvent" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'generation';
ALTER TABLE "AiUsageEvent" ADD COLUMN "model" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AiUsageEvent" ADD COLUMN "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiUsageEvent" ADD COLUMN "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_aiAssistItemId_fkey" FOREIGN KEY ("aiAssistItemId") REFERENCES "AiAssistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AiUsageEvent_organizationId_createdAt_idx" ON "AiUsageEvent"("organizationId", "createdAt");

-- Capability: confirmed zero indexes today on the single most-queried FK
-- lookup used by every fingerprint/context loader (§43).
CREATE INDEX "Capability_intakeAnswerSetId_idx" ON "Capability"("intakeAnswerSetId");
