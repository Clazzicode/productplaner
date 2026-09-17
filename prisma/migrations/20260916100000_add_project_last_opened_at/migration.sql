-- Adds Project.lastOpenedAt (directive item 12: "recently opened project",
-- distinct from updatedAt/last-edited). Purely additive, single nullable
-- column — hand-written per the convention established at
-- add_project_layer_step_a (platform_admins's cross-schema FK into
-- auth.users breaks both `migrate dev` and `migrate diff`). No RLS change:
-- Project's existing project_all policy (is_org_member("organizationId"))
-- already covers every column on the table, including this one.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "lastOpenedAt" TIMESTAMP(3);
