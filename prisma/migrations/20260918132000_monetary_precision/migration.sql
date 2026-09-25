-- Conversion preserves existing rows, rounding monetary planning estimates
-- to four decimals and AI micro-costs to eight. No narrative fields change.
ALTER TABLE "Organization" ALTER COLUMN "aiMonthlyBudgetUsd" TYPE NUMERIC(20,8) USING "aiMonthlyBudgetUsd"::numeric(20,8);
ALTER TABLE "Project" ALTER COLUMN budget TYPE NUMERIC(20,4) USING budget::numeric(20,4);
ALTER TABLE "Project" ALTER COLUMN "averageHourlyRate" TYPE NUMERIC(20,4) USING "averageHourlyRate"::numeric(20,4);
ALTER TABLE "Initiative" ALTER COLUMN "budgetOverride" TYPE NUMERIC(20,4) USING "budgetOverride"::numeric(20,4);
ALTER TABLE "Initiative" ALTER COLUMN "averageHourlyRateOverride" TYPE NUMERIC(20,4) USING "averageHourlyRateOverride"::numeric(20,4);
ALTER TABLE "AiUsageEvent" ALTER COLUMN "estimatedCostUsd" TYPE NUMERIC(20,8) USING "estimatedCostUsd"::numeric(20,8);
CREATE INDEX "Initiative_organizationId_projectId_idx" ON "Initiative"("organizationId","projectId");
CREATE INDEX "Project_organizationId_updatedAt_idx" ON "Project"("organizationId","updatedAt");
