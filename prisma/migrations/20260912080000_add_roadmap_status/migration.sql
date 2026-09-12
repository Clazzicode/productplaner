-- Red/Yellow/Green roadmap status. Purely additive — new, empty table.
-- Hand-written, same reason as every migration since add_project_layer_step_a
-- (see its header comment): `migrate dev`/`migrate diff` both fail before
-- reaching this change because of `platform_admins`'s cross-schema FK into
-- `auth.users`.

-- CreateTable
CREATE TABLE "RoadmapStatus" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "reason" TEXT NOT NULL DEFAULT '',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapStatus_entityType_entityId_key" ON "RoadmapStatus"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "RoadmapStatus" ADD CONSTRAINT "RoadmapStatus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoadmapStatus" ADD CONSTRAINT "RoadmapStatus_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: org-scoped domain row, same pattern as Decision/Risk/Project (direct
-- organizationId column, no join needed).
ALTER TABLE "RoadmapStatus" ENABLE ROW LEVEL SECURITY;

CREATE POLICY roadmap_status_all ON "RoadmapStatus" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
