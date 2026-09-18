-- CreateTable
CREATE TABLE "AiCapability" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 4096,
    "userMonthlyLimit" INTEGER NOT NULL DEFAULT 50,
    "organizationMonthlyLimit" INTEGER NOT NULL DEFAULT 500,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRequestLock" (
    "id" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRequestLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeAiAnalysis" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "assumptionsJson" TEXT NOT NULL,
    "missingInformationJson" TEXT NOT NULL,
    "risksJson" TEXT NOT NULL,
    "recommendedPhasesJson" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeAiAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiCapability_action_key" ON "AiCapability"("action");

-- CreateIndex
CREATE INDEX "AiUsageEvent_userId_action_createdAt_idx" ON "AiUsageEvent"("userId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsageEvent_organizationId_action_createdAt_idx" ON "AiUsageEvent"("organizationId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiRequestLock_scopeKey_action_key" ON "AiRequestLock"("scopeKey", "action");

-- CreateIndex
CREATE INDEX "IntakeAiAnalysis_initiativeId_createdAt_idx" ON "IntakeAiAnalysis"("initiativeId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageEvent" ADD CONSTRAINT "AiUsageEvent_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequestLock" ADD CONSTRAINT "AiRequestLock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequestLock" ADD CONSTRAINT "AiRequestLock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRequestLock" ADD CONSTRAINT "AiRequestLock_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeAiAnalysis" ADD CONSTRAINT "IntakeAiAnalysis_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeAiAnalysis" ADD CONSTRAINT "IntakeAiAnalysis_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
