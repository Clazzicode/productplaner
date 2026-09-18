-- Roadmap versioning foundation. Purely additive: new RoadmapVersion table
-- (append-only archive of past approved roadmap states, FK'd to Initiative
-- not Prototype since Prototype rows are destroyed/recreated on every
-- regenerate) plus one nullable column on Prototype. Hand-written, same
-- reason as every migration since add_project_layer_step_a (prisma migrate
-- dev/diff both fail on platform_admins's cross-schema FK to auth.users).

-- AlterTable
ALTER TABLE "Prototype" ADD COLUMN "inputsFingerprintAtGeneration" TEXT;

-- CreateTable
CREATE TABLE "RoadmapVersion" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "snapshotJson" TEXT NOT NULL,
    "inputsFingerprint" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoadmapVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapVersion_initiativeId_versionNumber_key" ON "RoadmapVersion"("initiativeId", "versionNumber");
CREATE INDEX "RoadmapVersion_initiativeId_createdAt_idx" ON "RoadmapVersion"("initiativeId", "createdAt");

-- AddForeignKey
ALTER TABLE "RoadmapVersion" ADD CONSTRAINT "RoadmapVersion_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoadmapVersion" ADD CONSTRAINT "RoadmapVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: Initiative-scoped table with no organizationId column of its own —
-- same walk-the-FK-chain pattern as Prototype's own policy
-- (20260910044947_rls_policies/migration.sql:194-198), one join shallower
-- since RoadmapVersion references Initiative directly rather than via
-- Prototype.
ALTER TABLE "RoadmapVersion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY roadmap_version_all ON "RoadmapVersion" FOR ALL TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "RoadmapVersion"."initiativeId" AND is_org_member(i."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "RoadmapVersion"."initiativeId" AND is_org_member(i."organizationId")));
