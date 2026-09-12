-- AI job record foundation (directive §18-21). Purely additive: a new
-- AiJob table plus a nullable AiUsageEvent.aiJobId back-reference.
-- Hand-written, same reason as every migration since add_project_layer_step_a
-- (prisma migrate dev/diff both fail on platform_admins's cross-schema FK to
-- auth.users).

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "initiativeId" TEXT,
    "actionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "resultSummaryJson" TEXT,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AiUsageEvent" ADD COLUMN "aiJobId" TEXT;

-- CreateIndex
CREATE INDEX "AiJob_organizationId_actionKey_startedAt_idx" ON "AiJob"("organizationId", "actionKey", "startedAt");

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: mirrors ai_usage_event_select/insert exactly (20260910044947_rls_policies),
-- plus an UPDATE policy since (unlike AiUsageEvent, which is write-once) a job
-- row's status/completedAt/resultSummaryJson are updated as it progresses.
ALTER TABLE "AiJob" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_job_select ON "AiJob" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));

CREATE POLICY ai_job_insert ON "AiJob" FOR INSERT TO app_rw, authenticated
  WITH CHECK (is_org_member("organizationId"));

CREATE POLICY ai_job_update ON "AiJob" FOR UPDATE TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
