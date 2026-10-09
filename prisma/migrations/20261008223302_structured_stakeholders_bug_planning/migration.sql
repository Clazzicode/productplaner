-- AlterTable
ALTER TABLE "RefinementFinding" ADD COLUMN     "refinementSessionId" TEXT;

-- CreateTable
CREATE TABLE "StakeholderContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT,
    "external" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeholderContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "stakeholderId" TEXT NOT NULL,
    "productRole" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL DEFAULT '',
    "influence" TEXT NOT NULL DEFAULT 'medium',
    "interest" TEXT NOT NULL DEFAULT 'medium',
    "engagementExpectation" TEXT NOT NULL DEFAULT '',
    "planningRequestId" TEXT,
    "capabilityId" TEXT,
    "storyId" TEXT,
    "sprintId" TEXT,
    "releaseId" TEXT,
    "decisionId" TEXT,
    "refinementSessionId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakeholderAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StakeholderAssignmentRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "toRevision" INTEGER NOT NULL,
    "previousData" JSONB,
    "nextData" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StakeholderAssignmentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugPlanningRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "bugType" TEXT NOT NULL DEFAULT 'defect',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "sourceReference" TEXT,
    "externalSystem" TEXT,
    "externalKey" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "environment" TEXT NOT NULL DEFAULT '',
    "readinessStatus" TEXT NOT NULL DEFAULT 'needs_refinement',
    "affectedCapabilityId" TEXT,
    "affectedStoryId" TEXT,
    "affectedSprintId" TEXT,
    "affectedReleaseId" TEXT,
    "ownerUserId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugPlanningRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugPlanningRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "toRevision" INTEGER NOT NULL,
    "previousData" JSONB,
    "nextData" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugPlanningRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "facilitatorUserId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT '',
    "agenda" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefinementSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storyId" TEXT,
    "bugId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'selected',
    "estimateBefore" INTEGER,
    "estimateAfter" INTEGER,
    "scopeChange" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefinementSessionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementSessionQuestion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "ownerUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefinementSessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementSessionDecision" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefinementSessionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementSessionAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "completionNote" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefinementSessionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefinementSessionRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "toRevision" INTEGER NOT NULL,
    "previousData" JSONB,
    "nextData" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefinementSessionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkDependency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'depends_on',
    "description" TEXT NOT NULL DEFAULT '',
    "predecessorCapabilityId" TEXT,
    "predecessorStoryId" TEXT,
    "predecessorBugId" TEXT,
    "predecessorSprintId" TEXT,
    "predecessorReleaseId" TEXT,
    "dependentCapabilityId" TEXT,
    "dependentStoryId" TEXT,
    "dependentBugId" TEXT,
    "dependentSprintId" TEXT,
    "dependentReleaseId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningBlocker" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "blockerType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueAt" TIMESTAMP(3),
    "resolution" TEXT NOT NULL DEFAULT '',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "overrideByUserId" TEXT,
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "capabilityId" TEXT,
    "storyId" TEXT,
    "bugId" TEXT,
    "sprintId" TEXT,
    "releaseId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningBlockerRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "fromRevision" INTEGER NOT NULL,
    "toRevision" INTEGER NOT NULL,
    "previousData" JSONB,
    "nextData" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningBlockerRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintReadinessAssessment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "storyId" TEXT,
    "bugId" TEXT,
    "inputFingerprint" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "decidedByUserId" TEXT NOT NULL,
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintReadinessAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintReadinessCheck" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintReadinessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "goal" TEXT NOT NULL DEFAULT '',
    "cadence" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "capacityPoints" DOUBLE PRECISION NOT NULL,
    "plannedPoints" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "committedByUserId" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintPlanningItem" (
    "id" TEXT NOT NULL,
    "sprintPlanId" TEXT NOT NULL,
    "storyId" TEXT,
    "bugId" TEXT,
    "readinessAssessmentId" TEXT,
    "estimatePoints" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL,
    "carryoverReason" TEXT NOT NULL DEFAULT '',
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SprintPlanningItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StakeholderContact_organizationId_archivedAt_displayName_idx" ON "StakeholderContact"("organizationId", "archivedAt", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderContact_organizationId_userId_key" ON "StakeholderContact"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_organizationId_projectId_archivedAt_idx" ON "StakeholderAssignment"("organizationId", "projectId", "archivedAt");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_initiativeId_productRole_idx" ON "StakeholderAssignment"("initiativeId", "productRole");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_stakeholderId_archivedAt_idx" ON "StakeholderAssignment"("stakeholderId", "archivedAt");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_planningRequestId_idx" ON "StakeholderAssignment"("planningRequestId");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_capabilityId_idx" ON "StakeholderAssignment"("capabilityId");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_storyId_idx" ON "StakeholderAssignment"("storyId");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_sprintId_idx" ON "StakeholderAssignment"("sprintId");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_releaseId_idx" ON "StakeholderAssignment"("releaseId");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_decisionId_idx" ON "StakeholderAssignment"("decisionId");

-- CreateIndex
CREATE INDEX "StakeholderAssignment_refinementSessionId_idx" ON "StakeholderAssignment"("refinementSessionId");

-- CreateIndex
CREATE INDEX "StakeholderAssignmentRevision_organizationId_createdAt_idx" ON "StakeholderAssignmentRevision"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StakeholderAssignmentRevision_assignmentId_toRevision_key" ON "StakeholderAssignmentRevision"("assignmentId", "toRevision");

-- CreateIndex
CREATE UNIQUE INDEX "BugPlanningRecord_requestId_key" ON "BugPlanningRecord"("requestId");

-- CreateIndex
CREATE INDEX "BugPlanningRecord_organizationId_initiativeId_archivedAt_idx" ON "BugPlanningRecord"("organizationId", "initiativeId", "archivedAt");

-- CreateIndex
CREATE INDEX "BugPlanningRecord_initiativeId_severity_status_idx" ON "BugPlanningRecord"("initiativeId", "severity", "status");

-- CreateIndex
CREATE INDEX "BugPlanningRecord_affectedCapabilityId_idx" ON "BugPlanningRecord"("affectedCapabilityId");

-- CreateIndex
CREATE INDEX "BugPlanningRecord_affectedStoryId_idx" ON "BugPlanningRecord"("affectedStoryId");

-- CreateIndex
CREATE INDEX "BugPlanningRecord_affectedSprintId_idx" ON "BugPlanningRecord"("affectedSprintId");

-- CreateIndex
CREATE INDEX "BugPlanningRecord_affectedReleaseId_idx" ON "BugPlanningRecord"("affectedReleaseId");

-- CreateIndex
CREATE INDEX "BugPlanningRecord_ownerUserId_idx" ON "BugPlanningRecord"("ownerUserId");

-- CreateIndex
CREATE INDEX "BugPlanningRevision_organizationId_createdAt_idx" ON "BugPlanningRevision"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BugPlanningRevision_bugId_toRevision_key" ON "BugPlanningRevision"("bugId", "toRevision");

-- CreateIndex
CREATE INDEX "RefinementSession_organizationId_initiativeId_status_idx" ON "RefinementSession"("organizationId", "initiativeId", "status");

-- CreateIndex
CREATE INDEX "RefinementSession_initiativeId_scheduledAt_idx" ON "RefinementSession"("initiativeId", "scheduledAt");

-- CreateIndex
CREATE INDEX "RefinementSessionItem_storyId_idx" ON "RefinementSessionItem"("storyId");

-- CreateIndex
CREATE INDEX "RefinementSessionItem_bugId_idx" ON "RefinementSessionItem"("bugId");

-- CreateIndex
CREATE UNIQUE INDEX "RefinementSessionItem_sessionId_storyId_key" ON "RefinementSessionItem"("sessionId", "storyId");

-- CreateIndex
CREATE UNIQUE INDEX "RefinementSessionItem_sessionId_bugId_key" ON "RefinementSessionItem"("sessionId", "bugId");

-- CreateIndex
CREATE INDEX "RefinementSessionQuestion_sessionId_status_idx" ON "RefinementSessionQuestion"("sessionId", "status");

-- CreateIndex
CREATE INDEX "RefinementSessionQuestion_ownerUserId_status_idx" ON "RefinementSessionQuestion"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "RefinementSessionDecision_sessionId_decidedAt_idx" ON "RefinementSessionDecision"("sessionId", "decidedAt");

-- CreateIndex
CREATE INDEX "RefinementSessionAction_sessionId_status_idx" ON "RefinementSessionAction"("sessionId", "status");

-- CreateIndex
CREATE INDEX "RefinementSessionAction_ownerUserId_status_idx" ON "RefinementSessionAction"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "RefinementSessionRevision_organizationId_createdAt_idx" ON "RefinementSessionRevision"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefinementSessionRevision_sessionId_toRevision_key" ON "RefinementSessionRevision"("sessionId", "toRevision");

-- CreateIndex
CREATE INDEX "WorkDependency_organizationId_initiativeId_idx" ON "WorkDependency"("organizationId", "initiativeId");

-- CreateIndex
CREATE INDEX "WorkDependency_predecessorCapabilityId_idx" ON "WorkDependency"("predecessorCapabilityId");

-- CreateIndex
CREATE INDEX "WorkDependency_predecessorStoryId_idx" ON "WorkDependency"("predecessorStoryId");

-- CreateIndex
CREATE INDEX "WorkDependency_predecessorBugId_idx" ON "WorkDependency"("predecessorBugId");

-- CreateIndex
CREATE INDEX "WorkDependency_predecessorSprintId_idx" ON "WorkDependency"("predecessorSprintId");

-- CreateIndex
CREATE INDEX "WorkDependency_predecessorReleaseId_idx" ON "WorkDependency"("predecessorReleaseId");

-- CreateIndex
CREATE INDEX "WorkDependency_dependentCapabilityId_idx" ON "WorkDependency"("dependentCapabilityId");

-- CreateIndex
CREATE INDEX "WorkDependency_dependentStoryId_idx" ON "WorkDependency"("dependentStoryId");

-- CreateIndex
CREATE INDEX "WorkDependency_dependentBugId_idx" ON "WorkDependency"("dependentBugId");

-- CreateIndex
CREATE INDEX "WorkDependency_dependentSprintId_idx" ON "WorkDependency"("dependentSprintId");

-- CreateIndex
CREATE INDEX "WorkDependency_dependentReleaseId_idx" ON "WorkDependency"("dependentReleaseId");

-- CreateIndex
CREATE INDEX "PlanningBlocker_organizationId_initiativeId_status_idx" ON "PlanningBlocker"("organizationId", "initiativeId", "status");

-- CreateIndex
CREATE INDEX "PlanningBlocker_ownerUserId_status_idx" ON "PlanningBlocker"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "PlanningBlocker_capabilityId_idx" ON "PlanningBlocker"("capabilityId");

-- CreateIndex
CREATE INDEX "PlanningBlocker_storyId_idx" ON "PlanningBlocker"("storyId");

-- CreateIndex
CREATE INDEX "PlanningBlocker_bugId_idx" ON "PlanningBlocker"("bugId");

-- CreateIndex
CREATE INDEX "PlanningBlocker_sprintId_idx" ON "PlanningBlocker"("sprintId");

-- CreateIndex
CREATE INDEX "PlanningBlocker_releaseId_idx" ON "PlanningBlocker"("releaseId");

-- CreateIndex
CREATE INDEX "PlanningBlockerRevision_organizationId_createdAt_idx" ON "PlanningBlockerRevision"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanningBlockerRevision_blockerId_toRevision_key" ON "PlanningBlockerRevision"("blockerId", "toRevision");

-- CreateIndex
CREATE INDEX "SprintReadinessAssessment_organizationId_initiativeId_creat_idx" ON "SprintReadinessAssessment"("organizationId", "initiativeId", "createdAt");

-- CreateIndex
CREATE INDEX "SprintReadinessAssessment_storyId_createdAt_idx" ON "SprintReadinessAssessment"("storyId", "createdAt");

-- CreateIndex
CREATE INDEX "SprintReadinessAssessment_bugId_createdAt_idx" ON "SprintReadinessAssessment"("bugId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SprintReadinessCheck_assessmentId_checkKey_key" ON "SprintReadinessCheck"("assessmentId", "checkKey");

-- CreateIndex
CREATE UNIQUE INDEX "SprintPlan_sprintId_key" ON "SprintPlan"("sprintId");

-- CreateIndex
CREATE INDEX "SprintPlan_organizationId_initiativeId_status_idx" ON "SprintPlan"("organizationId", "initiativeId", "status");

-- CreateIndex
CREATE INDEX "SprintPlanningItem_storyId_idx" ON "SprintPlanningItem"("storyId");

-- CreateIndex
CREATE INDEX "SprintPlanningItem_bugId_idx" ON "SprintPlanningItem"("bugId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintPlanningItem_sprintPlanId_storyId_key" ON "SprintPlanningItem"("sprintPlanId", "storyId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintPlanningItem_sprintPlanId_bugId_key" ON "SprintPlanningItem"("sprintPlanId", "bugId");

-- CreateIndex
CREATE INDEX "RefinementFinding_refinementSessionId_idx" ON "RefinementFinding"("refinementSessionId");

-- AddForeignKey
ALTER TABLE "RefinementFinding" ADD CONSTRAINT "RefinementFinding_refinementSessionId_fkey" FOREIGN KEY ("refinementSessionId") REFERENCES "RefinementSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderContact" ADD CONSTRAINT "StakeholderContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderContact" ADD CONSTRAINT "StakeholderContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_stakeholderId_fkey" FOREIGN KEY ("stakeholderId") REFERENCES "StakeholderContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_planningRequestId_fkey" FOREIGN KEY ("planningRequestId") REFERENCES "PlanningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_refinementSessionId_fkey" FOREIGN KEY ("refinementSessionId") REFERENCES "RefinementSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignment" ADD CONSTRAINT "StakeholderAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignmentRevision" ADD CONSTRAINT "StakeholderAssignmentRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignmentRevision" ADD CONSTRAINT "StakeholderAssignmentRevision_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "StakeholderAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StakeholderAssignmentRevision" ADD CONSTRAINT "StakeholderAssignmentRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PlanningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_affectedCapabilityId_fkey" FOREIGN KEY ("affectedCapabilityId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_affectedStoryId_fkey" FOREIGN KEY ("affectedStoryId") REFERENCES "ArtifactLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_affectedSprintId_fkey" FOREIGN KEY ("affectedSprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_affectedReleaseId_fkey" FOREIGN KEY ("affectedReleaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRecord" ADD CONSTRAINT "BugPlanningRecord_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRevision" ADD CONSTRAINT "BugPlanningRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRevision" ADD CONSTRAINT "BugPlanningRevision_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugPlanningRevision" ADD CONSTRAINT "BugPlanningRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSession" ADD CONSTRAINT "RefinementSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSession" ADD CONSTRAINT "RefinementSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSession" ADD CONSTRAINT "RefinementSession_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSession" ADD CONSTRAINT "RefinementSession_facilitatorUserId_fkey" FOREIGN KEY ("facilitatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSession" ADD CONSTRAINT "RefinementSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionItem" ADD CONSTRAINT "RefinementSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RefinementSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionItem" ADD CONSTRAINT "RefinementSessionItem_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionItem" ADD CONSTRAINT "RefinementSessionItem_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionQuestion" ADD CONSTRAINT "RefinementSessionQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RefinementSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionQuestion" ADD CONSTRAINT "RefinementSessionQuestion_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionDecision" ADD CONSTRAINT "RefinementSessionDecision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RefinementSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionDecision" ADD CONSTRAINT "RefinementSessionDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionAction" ADD CONSTRAINT "RefinementSessionAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RefinementSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionAction" ADD CONSTRAINT "RefinementSessionAction_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionRevision" ADD CONSTRAINT "RefinementSessionRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionRevision" ADD CONSTRAINT "RefinementSessionRevision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "RefinementSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefinementSessionRevision" ADD CONSTRAINT "RefinementSessionRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_predecessorCapabilityId_fkey" FOREIGN KEY ("predecessorCapabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_predecessorStoryId_fkey" FOREIGN KEY ("predecessorStoryId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_predecessorBugId_fkey" FOREIGN KEY ("predecessorBugId") REFERENCES "BugPlanningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_predecessorSprintId_fkey" FOREIGN KEY ("predecessorSprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_predecessorReleaseId_fkey" FOREIGN KEY ("predecessorReleaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_dependentCapabilityId_fkey" FOREIGN KEY ("dependentCapabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_dependentStoryId_fkey" FOREIGN KEY ("dependentStoryId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_dependentBugId_fkey" FOREIGN KEY ("dependentBugId") REFERENCES "BugPlanningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_dependentSprintId_fkey" FOREIGN KEY ("dependentSprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_dependentReleaseId_fkey" FOREIGN KEY ("dependentReleaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkDependency" ADD CONSTRAINT "WorkDependency_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_overrideByUserId_fkey" FOREIGN KEY ("overrideByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlocker" ADD CONSTRAINT "PlanningBlocker_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlockerRevision" ADD CONSTRAINT "PlanningBlockerRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlockerRevision" ADD CONSTRAINT "PlanningBlockerRevision_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "PlanningBlocker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningBlockerRevision" ADD CONSTRAINT "PlanningBlockerRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintReadinessAssessment" ADD CONSTRAINT "SprintReadinessAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintReadinessAssessment" ADD CONSTRAINT "SprintReadinessAssessment_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintReadinessAssessment" ADD CONSTRAINT "SprintReadinessAssessment_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintReadinessAssessment" ADD CONSTRAINT "SprintReadinessAssessment_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintReadinessAssessment" ADD CONSTRAINT "SprintReadinessAssessment_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintReadinessCheck" ADD CONSTRAINT "SprintReadinessCheck_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "SprintReadinessAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlan" ADD CONSTRAINT "SprintPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlan" ADD CONSTRAINT "SprintPlan_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlan" ADD CONSTRAINT "SprintPlan_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlan" ADD CONSTRAINT "SprintPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlan" ADD CONSTRAINT "SprintPlan_committedByUserId_fkey" FOREIGN KEY ("committedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlanningItem" ADD CONSTRAINT "SprintPlanningItem_sprintPlanId_fkey" FOREIGN KEY ("sprintPlanId") REFERENCES "SprintPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlanningItem" ADD CONSTRAINT "SprintPlanningItem_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlanningItem" ADD CONSTRAINT "SprintPlanningItem_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "BugPlanningRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPlanningItem" ADD CONSTRAINT "SprintPlanningItem_readinessAssessmentId_fkey" FOREIGN KEY ("readinessAssessmentId") REFERENCES "SprintReadinessAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Production invariants that Prisma's schema DSL cannot express.
ALTER TABLE "StakeholderAssignment"
  ADD CONSTRAINT "StakeholderAssignment_single_target_check" CHECK (
    num_nonnulls("planningRequestId", "capabilityId", "storyId", "sprintId", "releaseId", "decisionId") = 1
  ),
  ADD CONSTRAINT "StakeholderAssignment_product_role_check" CHECK (
    "productRole" IN ('requestor','business_owner','product_owner','decision_maker','engineer','technical_owner','stakeholder','demo_owner','validator')
  ),
  ADD CONSTRAINT "StakeholderAssignment_influence_check" CHECK ("influence" IN ('low','medium','high')),
  ADD CONSTRAINT "StakeholderAssignment_interest_check" CHECK ("interest" IN ('low','medium','high')),
  ADD CONSTRAINT "StakeholderAssignment_revision_check" CHECK ("revision" > 0);

ALTER TABLE "StakeholderAssignmentRevision"
  ADD CONSTRAINT "StakeholderAssignmentRevision_sequence_check" CHECK ("fromRevision" > 0 AND "toRevision" = "fromRevision" + 1),
  ADD CONSTRAINT "StakeholderAssignmentRevision_reason_check" CHECK (char_length(btrim("reason")) >= 3);

ALTER TABLE "BugPlanningRecord"
  ADD CONSTRAINT "BugPlanningRecord_severity_check" CHECK ("severity" IN ('low','medium','high','critical')),
  ADD CONSTRAINT "BugPlanningRecord_status_check" CHECK ("status" IN ('open','in_progress','resolved','closed','accepted')),
  ADD CONSTRAINT "BugPlanningRecord_priority_check" CHECK ("priority" IN ('low','medium','high','critical')),
  ADD CONSTRAINT "BugPlanningRecord_readiness_check" CHECK ("readinessStatus" IN ('needs_refinement','ready_for_refinement','sprint_ready','blocked')),
  ADD CONSTRAINT "BugPlanningRecord_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "BugPlanningRecord_external_identity_check" CHECK (
    ("externalKey" IS NULL AND "externalSystem" IS NULL)
    OR ("externalKey" IS NOT NULL AND "externalSystem" IS NOT NULL)
  );

ALTER TABLE "BugPlanningRevision"
  ADD CONSTRAINT "BugPlanningRevision_sequence_check" CHECK ("fromRevision" > 0 AND "toRevision" = "fromRevision" + 1),
  ADD CONSTRAINT "BugPlanningRevision_reason_check" CHECK (char_length(btrim("reason")) >= 3);

CREATE UNIQUE INDEX "BugPlanningRecord_external_identity_key"
  ON "BugPlanningRecord"("organizationId", "externalSystem", "externalKey")
  WHERE "externalKey" IS NOT NULL;

-- Reject cross-tenant or cross-initiative references even if an application
-- mutation accidentally supplies individually valid foreign keys.
CREATE OR REPLACE FUNCTION validate_stakeholder_assignment_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Project" p
    WHERE p.id = NEW."projectId" AND p."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Stakeholder assignment project tenant mismatch'; END IF;

  IF NEW."initiativeId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Initiative" i
    WHERE i.id = NEW."initiativeId" AND i."projectId" = NEW."projectId"
      AND i."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Stakeholder assignment initiative tenant mismatch'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "StakeholderContact" c
    WHERE c.id = NEW."stakeholderId" AND c."organizationId" = NEW."organizationId"
  ) THEN RAISE EXCEPTION 'Stakeholder assignment contact tenant mismatch'; END IF;

  IF NEW."planningRequestId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "PlanningRequest" r JOIN "Initiative" i ON i.id = r."initiativeId"
    WHERE r.id = NEW."planningRequestId" AND i."projectId" = NEW."projectId"
      AND i."organizationId" = NEW."organizationId"
      AND (NEW."initiativeId" IS NULL OR i.id = NEW."initiativeId")
  ) THEN RAISE EXCEPTION 'Stakeholder assignment request parent mismatch'; END IF;

  IF NEW."capabilityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId"
      JOIN "Initiative" i ON i.id = a."initiativeId"
    WHERE c.id = NEW."capabilityId" AND i."projectId" = NEW."projectId"
      AND i."organizationId" = NEW."organizationId"
      AND (NEW."initiativeId" IS NULL OR i.id = NEW."initiativeId")
  ) THEN RAISE EXCEPTION 'Stakeholder assignment feature parent mismatch'; END IF;

  IF NEW."storyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ArtifactLayer" s JOIN "Prototype" p ON p.id = s."prototypeId"
      JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE s.id = NEW."storyId" AND s.type = 'story' AND i."projectId" = NEW."projectId"
      AND i."organizationId" = NEW."organizationId"
      AND (NEW."initiativeId" IS NULL OR i.id = NEW."initiativeId")
  ) THEN RAISE EXCEPTION 'Stakeholder assignment story parent mismatch'; END IF;

  IF NEW."sprintId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id = s."prototypeId"
      JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE s.id = NEW."sprintId" AND i."projectId" = NEW."projectId"
      AND i."organizationId" = NEW."organizationId"
      AND (NEW."initiativeId" IS NULL OR i.id = NEW."initiativeId")
  ) THEN RAISE EXCEPTION 'Stakeholder assignment sprint parent mismatch'; END IF;

  IF NEW."releaseId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Release" r JOIN "Prototype" p ON p.id = r."prototypeId"
      JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE r.id = NEW."releaseId" AND i."projectId" = NEW."projectId"
      AND i."organizationId" = NEW."organizationId"
      AND (NEW."initiativeId" IS NULL OR i.id = NEW."initiativeId")
  ) THEN RAISE EXCEPTION 'Stakeholder assignment release parent mismatch'; END IF;

  IF NEW."decisionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Decision" d
    WHERE d.id = NEW."decisionId" AND d."projectId" = NEW."projectId"
      AND d."organizationId" = NEW."organizationId"
      AND (NEW."initiativeId" IS NULL OR d."initiativeId" IS NULL OR d."initiativeId" = NEW."initiativeId")
  ) THEN RAISE EXCEPTION 'Stakeholder assignment decision parent mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER stakeholder_assignment_parent
BEFORE INSERT OR UPDATE ON "StakeholderAssignment"
FOR EACH ROW EXECUTE FUNCTION validate_stakeholder_assignment_parent();

CREATE OR REPLACE FUNCTION validate_bug_planning_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "PlanningRequest" r JOIN "Initiative" i ON i.id = r."initiativeId"
    WHERE r.id = NEW."requestId" AND r."initiativeId" = NEW."initiativeId"
      AND i."organizationId" = NEW."organizationId"
      AND COALESCE(r.data->>'kind', '') IN ('bug','defect')
  ) THEN RAISE EXCEPTION 'Bug planning request parent or work type mismatch'; END IF;

  IF NEW."affectedCapabilityId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId"
    WHERE c.id = NEW."affectedCapabilityId" AND a."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Bug affected feature parent mismatch'; END IF;

  IF NEW."affectedStoryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ArtifactLayer" s JOIN "Prototype" p ON p.id = s."prototypeId"
    WHERE s.id = NEW."affectedStoryId" AND s.type = 'story' AND p."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Bug affected story parent mismatch'; END IF;

  IF NEW."affectedSprintId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id = s."prototypeId"
    WHERE s.id = NEW."affectedSprintId" AND p."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Bug affected sprint parent mismatch'; END IF;

  IF NEW."affectedReleaseId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Release" r JOIN "Prototype" p ON p.id = r."prototypeId"
    WHERE r.id = NEW."affectedReleaseId" AND p."initiativeId" = NEW."initiativeId"
  ) THEN RAISE EXCEPTION 'Bug affected release parent mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bug_planning_parent
BEFORE INSERT OR UPDATE ON "BugPlanningRecord"
FOR EACH ROW EXECUTE FUNCTION validate_bug_planning_parent();

-- Application authorization remains the first layer. These policies provide
-- the required database-level tenant boundary for direct database access.
ALTER TABLE "StakeholderContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StakeholderAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StakeholderAssignmentRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BugPlanningRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BugPlanningRevision" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "StakeholderContact", "StakeholderAssignment", "StakeholderAssignmentRevision", "BugPlanningRecord", "BugPlanningRevision" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON "StakeholderContact", "StakeholderAssignment", "BugPlanningRecord" TO app_rw;
GRANT SELECT, INSERT ON "StakeholderAssignmentRevision", "BugPlanningRevision" TO app_rw;

CREATE POLICY stakeholder_contact_select ON "StakeholderContact" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY stakeholder_contact_insert ON "StakeholderContact" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY stakeholder_contact_update ON "StakeholderContact" FOR UPDATE TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

CREATE POLICY stakeholder_assignment_select ON "StakeholderAssignment" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY stakeholder_assignment_insert ON "StakeholderAssignment" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY stakeholder_assignment_update ON "StakeholderAssignment" FOR UPDATE TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

CREATE POLICY stakeholder_assignment_revision_select ON "StakeholderAssignmentRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY stakeholder_assignment_revision_insert ON "StakeholderAssignmentRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));

CREATE POLICY bug_planning_select ON "BugPlanningRecord" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY bug_planning_insert ON "BugPlanningRecord" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY bug_planning_update ON "BugPlanningRecord" FOR UPDATE TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

CREATE POLICY bug_planning_revision_select ON "BugPlanningRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY bug_planning_revision_insert ON "BugPlanningRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));

-- Refinement, dependency, blocker, readiness, and sprint-planning invariants.
ALTER TABLE "RefinementSession"
  ADD CONSTRAINT "RefinementSession_status_check" CHECK ("status" IN ('scheduled','in_progress','completed','cancelled')),
  ADD CONSTRAINT "RefinementSession_revision_check" CHECK ("revision" > 0);
ALTER TABLE "RefinementSessionItem"
  ADD CONSTRAINT "RefinementSessionItem_single_target_check" CHECK (num_nonnulls("storyId", "bugId") = 1),
  ADD CONSTRAINT "RefinementSessionItem_status_check" CHECK ("status" IN ('selected','discussed','deferred','ready'));
ALTER TABLE "RefinementSessionQuestion" ADD CONSTRAINT "RefinementSessionQuestion_status_check" CHECK ("status" IN ('open','answered','dismissed'));
ALTER TABLE "RefinementSessionAction" ADD CONSTRAINT "RefinementSessionAction_status_check" CHECK ("status" IN ('open','completed','cancelled'));
ALTER TABLE "RefinementSessionRevision"
  ADD CONSTRAINT "RefinementSessionRevision_sequence_check" CHECK ("fromRevision" > 0 AND "toRevision" = "fromRevision" + 1),
  ADD CONSTRAINT "RefinementSessionRevision_reason_check" CHECK (char_length(btrim("reason")) >= 3);

ALTER TABLE "WorkDependency"
  ADD CONSTRAINT "WorkDependency_predecessor_target_check" CHECK (num_nonnulls("predecessorCapabilityId", "predecessorStoryId", "predecessorBugId", "predecessorSprintId", "predecessorReleaseId") = 1),
  ADD CONSTRAINT "WorkDependency_dependent_target_check" CHECK (num_nonnulls("dependentCapabilityId", "dependentStoryId", "dependentBugId", "dependentSprintId", "dependentReleaseId") = 1),
  ADD CONSTRAINT "WorkDependency_type_check" CHECK ("dependencyType" IN ('depends_on','blocks')),
  ADD CONSTRAINT "WorkDependency_no_self_check" CHECK (NOT (
    ("predecessorCapabilityId" IS NOT NULL AND "predecessorCapabilityId" = "dependentCapabilityId") OR
    ("predecessorStoryId" IS NOT NULL AND "predecessorStoryId" = "dependentStoryId") OR
    ("predecessorBugId" IS NOT NULL AND "predecessorBugId" = "dependentBugId") OR
    ("predecessorSprintId" IS NOT NULL AND "predecessorSprintId" = "dependentSprintId") OR
    ("predecessorReleaseId" IS NOT NULL AND "predecessorReleaseId" = "dependentReleaseId")
  ));

CREATE UNIQUE INDEX "WorkDependency_endpoint_key"
  ON "WorkDependency"(
    "initiativeId",
    (COALESCE('feature:' || "predecessorCapabilityId", 'story:' || "predecessorStoryId", 'bug:' || "predecessorBugId", 'sprint:' || "predecessorSprintId", 'release:' || "predecessorReleaseId")),
    (COALESCE('feature:' || "dependentCapabilityId", 'story:' || "dependentStoryId", 'bug:' || "dependentBugId", 'sprint:' || "dependentSprintId", 'release:' || "dependentReleaseId"))
  );

ALTER TABLE "PlanningBlocker"
  ADD CONSTRAINT "PlanningBlocker_single_target_check" CHECK (num_nonnulls("capabilityId", "storyId", "bugId", "sprintId", "releaseId") = 1),
  ADD CONSTRAINT "PlanningBlocker_status_check" CHECK ("status" IN ('open','in_progress','resolved','accepted')),
  ADD CONSTRAINT "PlanningBlocker_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "PlanningBlocker_resolution_check" CHECK ("status" <> 'resolved' OR (char_length(btrim("resolution")) > 0 AND "resolvedAt" IS NOT NULL AND "resolvedByUserId" IS NOT NULL)),
  ADD CONSTRAINT "PlanningBlocker_override_check" CHECK ("status" <> 'accepted' OR (char_length(btrim("overrideReason")) > 0 AND "overrideByUserId" IS NOT NULL));
ALTER TABLE "PlanningBlockerRevision"
  ADD CONSTRAINT "PlanningBlockerRevision_sequence_check" CHECK ("fromRevision" > 0 AND "toRevision" = "fromRevision" + 1),
  ADD CONSTRAINT "PlanningBlockerRevision_reason_check" CHECK (char_length(btrim("reason")) >= 3);

ALTER TABLE "SprintReadinessAssessment"
  ADD CONSTRAINT "SprintReadinessAssessment_single_target_check" CHECK (num_nonnulls("storyId", "bugId") = 1),
  ADD CONSTRAINT "SprintReadinessAssessment_decision_check" CHECK ("decision" IN ('ready','not_ready','overridden')),
  ADD CONSTRAINT "SprintReadinessAssessment_reason_check" CHECK (char_length(btrim("reason")) >= 3),
  ADD CONSTRAINT "SprintReadinessAssessment_override_reason_check" CHECK ("decision" <> 'overridden' OR char_length(btrim("reason")) >= 5),
  ADD CONSTRAINT "SprintReadinessAssessment_fingerprint_check" CHECK (char_length("inputFingerprint") = 64);
ALTER TABLE "SprintReadinessCheck" ADD CONSTRAINT "SprintReadinessCheck_status_check" CHECK ("status" IN ('pass','fail','review'));
ALTER TABLE "SprintPlan"
  ADD CONSTRAINT "SprintPlan_status_check" CHECK ("status" IN ('draft','committed')),
  ADD CONSTRAINT "SprintPlan_capacity_check" CHECK ("capacityPoints" >= 0 AND "plannedPoints" >= 0),
  ADD CONSTRAINT "SprintPlan_revision_check" CHECK ("revision" > 0),
  ADD CONSTRAINT "SprintPlan_commit_check" CHECK ("status" <> 'committed' OR ("committedAt" IS NOT NULL AND "committedByUserId" IS NOT NULL));
ALTER TABLE "SprintPlanningItem"
  ADD CONSTRAINT "SprintPlanningItem_single_target_check" CHECK (num_nonnulls("storyId", "bugId") = 1),
  ADD CONSTRAINT "SprintPlanningItem_estimate_check" CHECK ("estimatePoints" > 0);

CREATE OR REPLACE FUNCTION validate_po_workflow_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = NEW."initiativeId" AND i."organizationId" = NEW."organizationId")
  THEN RAISE EXCEPTION 'PO workflow tenant mismatch'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER refinement_session_tenant BEFORE INSERT OR UPDATE ON "RefinementSession" FOR EACH ROW EXECUTE FUNCTION validate_po_workflow_tenant();
CREATE TRIGGER work_dependency_tenant BEFORE INSERT OR UPDATE ON "WorkDependency" FOR EACH ROW EXECUTE FUNCTION validate_po_workflow_tenant();
CREATE TRIGGER planning_blocker_tenant BEFORE INSERT OR UPDATE ON "PlanningBlocker" FOR EACH ROW EXECUTE FUNCTION validate_po_workflow_tenant();
CREATE TRIGGER sprint_readiness_tenant BEFORE INSERT OR UPDATE ON "SprintReadinessAssessment" FOR EACH ROW EXECUTE FUNCTION validate_po_workflow_tenant();
CREATE TRIGGER sprint_plan_tenant BEFORE INSERT OR UPDATE ON "SprintPlan" FOR EACH ROW EXECUTE FUNCTION validate_po_workflow_tenant();

CREATE OR REPLACE FUNCTION validate_refinement_session_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = NEW."initiativeId" AND i."projectId" = NEW."projectId" AND i."organizationId" = NEW."organizationId")
  THEN RAISE EXCEPTION 'Refinement session project mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refinement_session_parent BEFORE INSERT OR UPDATE ON "RefinementSession" FOR EACH ROW EXECUTE FUNCTION validate_refinement_session_parent();

CREATE OR REPLACE FUNCTION validate_refinement_item_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE expected_initiative TEXT;
BEGIN
  SELECT "initiativeId" INTO expected_initiative FROM "RefinementSession" WHERE id = NEW."sessionId";
  IF NEW."storyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ArtifactLayer" a JOIN "Prototype" p ON p.id = a."prototypeId"
    WHERE a.id = NEW."storyId" AND a.type = 'story' AND p."initiativeId" = expected_initiative
  ) THEN RAISE EXCEPTION 'Refinement story initiative mismatch'; END IF;
  IF NEW."bugId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "BugPlanningRecord" b WHERE b.id = NEW."bugId" AND b."initiativeId" = expected_initiative
  ) THEN RAISE EXCEPTION 'Refinement bug initiative mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER refinement_item_parent BEFORE INSERT OR UPDATE ON "RefinementSessionItem" FOR EACH ROW EXECUTE FUNCTION validate_refinement_item_parent();

CREATE OR REPLACE FUNCTION validate_dependency_targets() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."predecessorCapabilityId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId" WHERE c.id = NEW."predecessorCapabilityId" AND a."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency predecessor feature mismatch'; END IF;
  IF NEW."dependentCapabilityId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId" WHERE c.id = NEW."dependentCapabilityId" AND a."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency dependent feature mismatch'; END IF;
  IF NEW."predecessorStoryId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArtifactLayer" a JOIN "Prototype" p ON p.id = a."prototypeId" WHERE a.id = NEW."predecessorStoryId" AND a.type = 'story' AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency predecessor story mismatch'; END IF;
  IF NEW."dependentStoryId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArtifactLayer" a JOIN "Prototype" p ON p.id = a."prototypeId" WHERE a.id = NEW."dependentStoryId" AND a.type = 'story' AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency dependent story mismatch'; END IF;
  IF NEW."predecessorBugId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "BugPlanningRecord" b WHERE b.id = NEW."predecessorBugId" AND b."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency predecessor bug mismatch'; END IF;
  IF NEW."dependentBugId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "BugPlanningRecord" b WHERE b.id = NEW."dependentBugId" AND b."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency dependent bug mismatch'; END IF;
  IF NEW."predecessorSprintId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id = s."prototypeId" WHERE s.id = NEW."predecessorSprintId" AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency predecessor sprint mismatch'; END IF;
  IF NEW."dependentSprintId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id = s."prototypeId" WHERE s.id = NEW."dependentSprintId" AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency dependent sprint mismatch'; END IF;
  IF NEW."predecessorReleaseId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Release" r JOIN "Prototype" p ON p.id = r."prototypeId" WHERE r.id = NEW."predecessorReleaseId" AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency predecessor release mismatch'; END IF;
  IF NEW."dependentReleaseId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Release" r JOIN "Prototype" p ON p.id = r."prototypeId" WHERE r.id = NEW."dependentReleaseId" AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Dependency dependent release mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dependency_targets BEFORE INSERT OR UPDATE ON "WorkDependency" FOR EACH ROW EXECUTE FUNCTION validate_dependency_targets();

CREATE OR REPLACE FUNCTION validate_blocker_target() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."capabilityId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" a ON a.id = c."intakeAnswerSetId" WHERE c.id = NEW."capabilityId" AND a."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Blocker feature mismatch'; END IF;
  IF NEW."storyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArtifactLayer" a JOIN "Prototype" p ON p.id = a."prototypeId" WHERE a.id = NEW."storyId" AND a.type = 'story' AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Blocker story mismatch'; END IF;
  IF NEW."bugId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "BugPlanningRecord" b WHERE b.id = NEW."bugId" AND b."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Blocker bug mismatch'; END IF;
  IF NEW."sprintId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id = s."prototypeId" WHERE s.id = NEW."sprintId" AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Blocker sprint mismatch'; END IF;
  IF NEW."releaseId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Release" r JOIN "Prototype" p ON p.id = r."prototypeId" WHERE r.id = NEW."releaseId" AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Blocker release mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER blocker_target BEFORE INSERT OR UPDATE ON "PlanningBlocker" FOR EACH ROW EXECUTE FUNCTION validate_blocker_target();

CREATE OR REPLACE FUNCTION validate_readiness_target() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."storyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArtifactLayer" a JOIN "Prototype" p ON p.id = a."prototypeId" WHERE a.id = NEW."storyId" AND a.type = 'story' AND p."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Readiness story mismatch'; END IF;
  IF NEW."bugId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "BugPlanningRecord" b WHERE b.id = NEW."bugId" AND b."initiativeId" = NEW."initiativeId") THEN RAISE EXCEPTION 'Readiness bug mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER readiness_target BEFORE INSERT OR UPDATE ON "SprintReadinessAssessment" FOR EACH ROW EXECUTE FUNCTION validate_readiness_target();

CREATE OR REPLACE FUNCTION protect_readiness_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF ROW(NEW.id, NEW."organizationId", NEW."initiativeId", NEW."storyId", NEW."bugId", NEW."inputFingerprint", NEW.decision, NEW.reason, NEW."decidedByUserId", NEW."createdAt")
     IS DISTINCT FROM
     ROW(OLD.id, OLD."organizationId", OLD."initiativeId", OLD."storyId", OLD."bugId", OLD."inputFingerprint", OLD.decision, OLD.reason, OLD."decidedByUserId", OLD."createdAt")
  THEN RAISE EXCEPTION 'Sprint readiness evidence is immutable'; END IF;
  IF OLD."invalidatedAt" IS NOT NULL AND NEW."invalidatedAt" IS DISTINCT FROM OLD."invalidatedAt"
  THEN RAISE EXCEPTION 'Invalidated readiness evidence cannot be restored or rewritten'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_readiness_evidence BEFORE UPDATE ON "SprintReadinessAssessment" FOR EACH ROW EXECUTE FUNCTION protect_readiness_evidence();

CREATE OR REPLACE FUNCTION validate_sprint_plan_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Sprint" s JOIN "Prototype" p ON p.id = s."prototypeId" WHERE s.id = NEW."sprintId" AND p."initiativeId" = NEW."initiativeId")
  THEN RAISE EXCEPTION 'Sprint plan initiative mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sprint_plan_parent BEFORE INSERT OR UPDATE ON "SprintPlan" FOR EACH ROW EXECUTE FUNCTION validate_sprint_plan_parent();

CREATE OR REPLACE FUNCTION validate_sprint_planning_item() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE expected_initiative TEXT;
BEGIN
  SELECT "initiativeId" INTO expected_initiative FROM "SprintPlan" WHERE id = NEW."sprintPlanId";
  IF NEW."storyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "ArtifactLayer" a JOIN "Prototype" p ON p.id = a."prototypeId" WHERE a.id = NEW."storyId" AND a.type = 'story' AND p."initiativeId" = expected_initiative) THEN RAISE EXCEPTION 'Sprint plan story mismatch'; END IF;
  IF NEW."bugId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "BugPlanningRecord" b WHERE b.id = NEW."bugId" AND b."initiativeId" = expected_initiative) THEN RAISE EXCEPTION 'Sprint plan bug mismatch'; END IF;
  IF NEW."readinessAssessmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "SprintReadinessAssessment" a WHERE a.id = NEW."readinessAssessmentId" AND a."initiativeId" = expected_initiative
      AND ((NEW."storyId" IS NOT NULL AND a."storyId" = NEW."storyId") OR (NEW."bugId" IS NOT NULL AND a."bugId" = NEW."bugId"))
  ) THEN RAISE EXCEPTION 'Sprint plan readiness evidence mismatch'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sprint_planning_item_parent BEFORE INSERT OR UPDATE ON "SprintPlanningItem" FOR EACH ROW EXECUTE FUNCTION validate_sprint_planning_item();

ALTER TABLE "RefinementSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefinementSessionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefinementSessionQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefinementSessionDecision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefinementSessionAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefinementSessionRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkDependency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanningBlocker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanningBlockerRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SprintReadinessAssessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SprintReadinessCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SprintPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SprintPlanningItem" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "RefinementSession", "RefinementSessionItem", "RefinementSessionQuestion", "RefinementSessionDecision", "RefinementSessionAction", "RefinementSessionRevision", "WorkDependency", "PlanningBlocker", "PlanningBlockerRevision", "SprintReadinessAssessment", "SprintReadinessCheck", "SprintPlan", "SprintPlanningItem" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON "RefinementSession", "RefinementSessionItem", "RefinementSessionQuestion", "RefinementSessionDecision", "RefinementSessionAction", "PlanningBlocker", "SprintPlan" TO app_rw;
GRANT SELECT, INSERT ON "RefinementSessionRevision", "WorkDependency", "PlanningBlockerRevision", "SprintReadinessAssessment", "SprintReadinessCheck" TO app_rw;
GRANT UPDATE ("invalidatedAt") ON "SprintReadinessAssessment" TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SprintPlanningItem" TO app_rw;

CREATE POLICY refinement_session_all ON "RefinementSession" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY refinement_item_all ON "RefinementSessionItem" FOR ALL TO app_rw
  USING (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")));
CREATE POLICY refinement_question_all ON "RefinementSessionQuestion" FOR ALL TO app_rw
  USING (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")));
CREATE POLICY refinement_decision_all ON "RefinementSessionDecision" FOR ALL TO app_rw
  USING (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")));
CREATE POLICY refinement_action_all ON "RefinementSessionAction" FOR ALL TO app_rw
  USING (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "RefinementSession" s WHERE s.id = "sessionId" AND is_org_member(s."organizationId")));
CREATE POLICY refinement_revision_select ON "RefinementSessionRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY refinement_revision_insert ON "RefinementSessionRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY work_dependency_select ON "WorkDependency" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY work_dependency_insert ON "WorkDependency" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY planning_blocker_all ON "PlanningBlocker" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY planning_blocker_revision_select ON "PlanningBlockerRevision" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY planning_blocker_revision_insert ON "PlanningBlockerRevision" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY sprint_readiness_select ON "SprintReadinessAssessment" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY sprint_readiness_insert ON "SprintReadinessAssessment" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY sprint_readiness_invalidate ON "SprintReadinessAssessment" FOR UPDATE TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY sprint_readiness_check_select ON "SprintReadinessCheck" FOR SELECT TO app_rw
  USING (EXISTS (SELECT 1 FROM "SprintReadinessAssessment" a WHERE a.id = "assessmentId" AND is_org_member(a."organizationId")));
CREATE POLICY sprint_readiness_check_insert ON "SprintReadinessCheck" FOR INSERT TO app_rw
  WITH CHECK (EXISTS (SELECT 1 FROM "SprintReadinessAssessment" a WHERE a.id = "assessmentId" AND is_org_member(a."organizationId")));
CREATE POLICY sprint_plan_all ON "SprintPlan" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY sprint_plan_item_all ON "SprintPlanningItem" FOR ALL TO app_rw
  USING (EXISTS (SELECT 1 FROM "SprintPlan" p WHERE p.id = "sprintPlanId" AND is_org_member(p."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "SprintPlan" p WHERE p.id = "sprintPlanId" AND is_org_member(p."organizationId")));
