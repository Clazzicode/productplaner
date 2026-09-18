-- Step A of the account/workspace -> Project -> Initiative restructure.
-- Purely additive: new Project/Decision/Risk tables, plus two new nullable
-- columns on Initiative (projectId, intakeMethod). Zero DROP, zero RENAME,
-- zero tightened-NOT-NULL — existing rows and existing code paths (which
-- still read Initiative.budget/averageHourlyRate/targetLaunchDate directly)
-- keep working unchanged until step B backfills every Initiative with a
-- Project and step C (shipped together with the app-code cutover) tightens
-- Initiative.projectId to required and drops the three now-redundant columns.
--
-- Hand-written (not generated via `prisma migrate dev`/`migrate diff`):
-- this database's `platform_admins` table has a raw-SQL FK into Supabase's
-- `auth` schema, which isn't listed in this datasource's `schemas` property,
-- so both `migrate dev` (shadow DB lacks the `auth` schema entirely) and
-- `migrate diff --from-url`/`--from-migrations` (introspection trips on the
-- cross-schema FK) fail before reaching this change. Every RLS-bearing
-- migration since `rls_policies` was hand-written for the same reason (see
-- e.g. `add_planning_weight_override`) — this one follows that exact
-- established convention: Prisma-style DDL, RLS appended by hand.

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL DEFAULT '',
    "budget" DOUBLE PRECISION,
    "averageHourlyRate" DOUBLE PRECISION DEFAULT 85,
    "targetLaunchDate" TIMESTAMP(3),
    "teamCompositionJson" TEXT NOT NULL DEFAULT '{}',
    "constraintsJson" TEXT NOT NULL DEFAULT '[]',
    "stakeholdersJson" TEXT NOT NULL DEFAULT '[]',
    "planningApproach" TEXT NOT NULL DEFAULT '',
    "connectedSystemsJson" TEXT NOT NULL DEFAULT '[]',
    "defaultMethodology" TEXT NOT NULL DEFAULT 'hybrid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initiativeId" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Initiative" ADD COLUMN "intakeMethod" TEXT;

-- CreateIndex
CREATE INDEX "Initiative_projectId_idx" ON "Initiative"("projectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Decision" ADD CONSTRAINT "Decision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Risk" ADD CONSTRAINT "Risk_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (docs/V2-MULTI-TENANT-AUTH.md convention). Has no effect on the
-- running app yet for the same reason it never has in prior migrations:
-- DATABASE_URL already connects as app_rw in this codebase (unlike the
-- original rls_foundation-era comment), so this takes effect immediately —
-- verified independently via the isolation test suite added in this same
-- change, not assumed.

-- Project mirrors initiative_all exactly: denormalized organizationId column,
-- org-membership scoped, no bootstrap-visibility special case needed (a
-- Project is only ever created by a user who already has an active
-- OrganizationMember row, unlike Organization/OrganizationMember at signup).
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_all ON "Project" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

-- Decision/Risk: org-scoped domain rows, same pattern as Initiative/
-- IntegrationConnection (direct organizationId column, no join needed).
ALTER TABLE "Decision" ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_all ON "Decision" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

ALTER TABLE "Risk" ENABLE ROW LEVEL SECURITY;

CREATE POLICY risk_all ON "Risk" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
