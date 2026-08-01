-- AlterTable
ALTER TABLE "Capability" ADD COLUMN     "businessValueScore" DOUBLE PRECISION,
ADD COLUMN     "customerImpactScore" INTEGER,
ADD COLUMN     "mvpImportance" TEXT,
ADD COLUMN     "revenueImpactScore" INTEGER,
ADD COLUMN     "riskComplianceScore" INTEGER,
ADD COLUMN     "riskLevel" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "strategicAlignmentScore" INTEGER;

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN     "averageHourlyRate" DOUBLE PRECISION DEFAULT 85,
ADD COLUMN     "budget" DOUBLE PRECISION,
ADD COLUMN     "targetLaunchDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IntakeAnswerSet" ADD COLUMN     "historicalVelocityPoints" DOUBLE PRECISION,
ADD COLUMN     "hoursPerSprintPerMember" DOUBLE PRECISION NOT NULL DEFAULT 80,
ADD COLUMN     "hoursPerStoryPoint" DOUBLE PRECISION NOT NULL DEFAULT 8,
ADD COLUMN     "utilizationRatePercent" INTEGER NOT NULL DEFAULT 70,
ALTER COLUMN "capacityBufferPercent" SET DEFAULT 15;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "demoModeEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IntegrationProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT NOT NULL DEFAULT '',
    "previewImagePath" TEXT NOT NULL DEFAULT '',
    "statusDefault" TEXT NOT NULL DEFAULT 'available',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "supportsDemoConnection" BOOLEAN NOT NULL DEFAULT true,
    "supportsSync" BOOLEAN NOT NULL DEFAULT true,
    "supportsImport" BOOLEAN NOT NULL DEFAULT false,
    "supportsExport" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "providerId" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'available',
    "mode" TEXT NOT NULL DEFAULT 'demo',
    "workspaceName" TEXT,
    "workspaceUrl" TEXT,
    "projectKey" TEXT,
    "projectName" TEXT,
    "configuredByUserId" TEXT,
    "configuredAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncMessage" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCapability" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "capabilityLabel" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isEnabledByDefault" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IntegrationCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationSyncLog" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "detailsJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationProvider_key_key" ON "IntegrationProvider"("key");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_organizationId_providerId_initiativeI_key" ON "IntegrationConnection"("organizationId", "providerId", "initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCapability_providerId_capabilityKey_key" ON "IntegrationCapability"("providerId", "capabilityKey");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCapability" ADD CONSTRAINT "IntegrationCapability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationSyncLog" ADD CONSTRAINT "IntegrationSyncLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
