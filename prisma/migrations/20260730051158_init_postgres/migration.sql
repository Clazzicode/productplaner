-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualifyingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "experienceLevel" TEXT NOT NULL,
    "teamComposition" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "executionTool" TEXT NOT NULL,
    "statedMethodology" TEXT NOT NULL DEFAULT 'hybrid',
    "isProductWork" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualifyingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qualifyingProfileId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "methodology" TEXT NOT NULL DEFAULT 'hybrid',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAnswerSet" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL DEFAULT '',
    "targetCustomer" TEXT NOT NULL DEFAULT '',
    "outcomeStatement" TEXT NOT NULL DEFAULT '',
    "outcomeMetric" TEXT NOT NULL DEFAULT '',
    "teamSize" INTEGER,
    "sprintLengthWeeks" INTEGER NOT NULL DEFAULT 2,
    "velocityPerPersonPerSprint" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "capacityBufferPercent" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeAnswerSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capability" (
    "id" TEXT NOT NULL,
    "intakeAnswerSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isMvp" BOOLEAN NOT NULL,
    "effortSize" TEXT NOT NULL,
    "businessValue" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Capability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilityDependency" (
    "id" TEXT NOT NULL,
    "fromCapabilityId" TEXT NOT NULL,
    "toCapabilityId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CapabilityDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prototype" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "approvedBaselineJson" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prototype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LayerLock" (
    "id" TEXT NOT NULL,
    "prototypeId" TEXT NOT NULL,
    "layerType" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'unlocked',
    "everLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "LayerLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactLayer" (
    "id" TEXT NOT NULL,
    "prototypeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "contentJson" TEXT NOT NULL DEFAULT '{}',
    "points" INTEGER,
    "sourceCapabilityId" TEXT,
    "traceAnswerKeys" TEXT NOT NULL DEFAULT '',
    "traceNote" TEXT NOT NULL DEFAULT '',
    "sprintId" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "prototypeId" TEXT NOT NULL,
    "sprintNumber" INTEGER NOT NULL,
    "phaseNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "capacityPoints" DOUBLE PRECISION NOT NULL,
    "releaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "prototypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phaseNumber" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncConnection" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "tool" TEXT NOT NULL DEFAULT 'jira',
    "status" TEXT NOT NULL DEFAULT 'not_connected',
    "connectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "fakeProjectKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeAnswerSet_initiativeId_key" ON "IntakeAnswerSet"("initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "CapabilityDependency_fromCapabilityId_toCapabilityId_key" ON "CapabilityDependency"("fromCapabilityId", "toCapabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "Prototype_initiativeId_key" ON "Prototype"("initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "LayerLock_prototypeId_layerType_key" ON "LayerLock"("prototypeId", "layerType");

-- CreateIndex
CREATE INDEX "ArtifactLayer_prototypeId_type_idx" ON "ArtifactLayer"("prototypeId", "type");

-- CreateIndex
CREATE INDEX "ArtifactLayer_parentId_idx" ON "ArtifactLayer"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Sprint_prototypeId_sprintNumber_key" ON "Sprint"("prototypeId", "sprintNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Release_prototypeId_order_key" ON "Release"("prototypeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "SyncConnection_initiativeId_tool_key" ON "SyncConnection"("initiativeId", "tool");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualifyingProfile" ADD CONSTRAINT "QualifyingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_qualifyingProfileId_fkey" FOREIGN KEY ("qualifyingProfileId") REFERENCES "QualifyingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeAnswerSet" ADD CONSTRAINT "IntakeAnswerSet_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capability" ADD CONSTRAINT "Capability_intakeAnswerSetId_fkey" FOREIGN KEY ("intakeAnswerSetId") REFERENCES "IntakeAnswerSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityDependency" ADD CONSTRAINT "CapabilityDependency_fromCapabilityId_fkey" FOREIGN KEY ("fromCapabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilityDependency" ADD CONSTRAINT "CapabilityDependency_toCapabilityId_fkey" FOREIGN KEY ("toCapabilityId") REFERENCES "Capability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prototype" ADD CONSTRAINT "Prototype_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LayerLock" ADD CONSTRAINT "LayerLock_prototypeId_fkey" FOREIGN KEY ("prototypeId") REFERENCES "Prototype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactLayer" ADD CONSTRAINT "ArtifactLayer_prototypeId_fkey" FOREIGN KEY ("prototypeId") REFERENCES "Prototype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactLayer" ADD CONSTRAINT "ArtifactLayer_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ArtifactLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactLayer" ADD CONSTRAINT "ArtifactLayer_sourceCapabilityId_fkey" FOREIGN KEY ("sourceCapabilityId") REFERENCES "Capability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactLayer" ADD CONSTRAINT "ArtifactLayer_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_prototypeId_fkey" FOREIGN KEY ("prototypeId") REFERENCES "Prototype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sprint" ADD CONSTRAINT "Sprint_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_prototypeId_fkey" FOREIGN KEY ("prototypeId") REFERENCES "Prototype"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncConnection" ADD CONSTRAINT "SyncConnection_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
