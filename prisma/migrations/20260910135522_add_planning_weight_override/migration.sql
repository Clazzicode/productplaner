-- CreateTable
CREATE TABLE "PlanningWeightOverride" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "weightSetId" TEXT NOT NULL,
    "weightsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanningWeightOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningWeightOverride_initiativeId_weightSetId_key" ON "PlanningWeightOverride"("initiativeId", "weightSetId");

-- AddForeignKey
ALTER TABLE "PlanningWeightOverride" ADD CONSTRAINT "PlanningWeightOverride_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (docs/V2-MULTI-TENANT-AUTH.md convention — child-of-initiative table,
-- same "walk the FK chain to Initiative.organizationId" pattern used for
-- IntakeAnswerSet/SyncConnection/IntakeAiAnalysis in the rls_policies
-- migration). Has no effect on the running app yet, same as that migration's
-- own note: DATABASE_URL still connects as `postgres`, which bypasses RLS.
ALTER TABLE "PlanningWeightOverride" ENABLE ROW LEVEL SECURITY;

CREATE POLICY planning_weight_override_all ON "PlanningWeightOverride" FOR ALL TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "PlanningWeightOverride"."initiativeId" AND is_org_member(i."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "PlanningWeightOverride"."initiativeId" AND is_org_member(i."organizationId")));
