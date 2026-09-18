-- Enable RLS + attach policies across every tenant-owned table
-- (docs/V2-MULTI-TENANT-AUTH.md). Uses the helper functions from the
-- rls_foundation migration (is_org_member/is_org_admin/is_org_owner/
-- current_app_user_id/is_platform_admin).
--
-- Scope, deliberately: this is tenant-BOUNDARY enforcement (never cross an
-- organization), not a reimplementation of the owner/edit/view/team/external-
-- cap algorithm in src/lib/access/resolution.ts — that stays authoritative at
-- the app layer for InitiativeAccess and everything beneath an Initiative.
-- RLS here is defense-in-depth against an app-layer bug, not a replacement.
--
-- Policies are granted to app_rw (this app's actual connecting role) and
-- authenticated (Supabase's normal role, unused today but harmless to cover
-- for forward-compatibility). Enabling RLS here has NO effect on the running
-- app yet — DATABASE_URL still points at `postgres`, which bypasses RLS
-- entirely; the connection only switches to app_rw in a later, separate step
-- once this is verified independently.

-- ---------- Identity ----------

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

-- Note: User.homeOrganizationId is a Prisma-level rename over the real
-- column, which is still named "organizationId" (@map, deliberately — see
-- prisma/schema.prisma) — raw SQL here must use the real column name.
CREATE POLICY user_select ON "User" FOR SELECT TO app_rw, authenticated
  USING ("authUserId" = auth.uid() OR is_org_member("organizationId"));

CREATE POLICY user_insert ON "User" FOR INSERT TO app_rw, authenticated
  WITH CHECK ("authUserId" = auth.uid());

CREATE POLICY user_update ON "User" FOR UPDATE TO app_rw, authenticated
  USING ("authUserId" = auth.uid() OR is_org_admin("organizationId"))
  WITH CHECK ("authUserId" = auth.uid() OR is_org_admin("organizationId"));

-- ---------- Org root ----------

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_select ON "Organization" FOR SELECT TO app_rw, authenticated
  USING (is_org_member(id));

-- Creating an org is not itself sensitive (matches today's app-layer
-- reality — signup always creates one); only reading/joining one is.
CREATE POLICY organization_insert ON "Organization" FOR INSERT TO app_rw, authenticated
  WITH CHECK (true);

CREATE POLICY organization_update ON "Organization" FOR UPDATE TO app_rw, authenticated
  USING (is_org_owner(id)) WITH CHECK (is_org_owner(id));

-- ---------- Membership ----------

ALTER TABLE "OrganizationMember" ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_member_select ON "OrganizationMember" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));

-- Self-insert covers solo/first-user-in-org signup, where no membership row
-- (and so no is_org_admin/is_org_owner) exists yet to authorize it.
CREATE POLICY org_member_insert ON "OrganizationMember" FOR INSERT TO app_rw, authenticated
  WITH CHECK ("authUserId" = auth.uid() OR is_org_admin("organizationId"));

CREATE POLICY org_member_update ON "OrganizationMember" FOR UPDATE TO app_rw, authenticated
  USING (is_org_admin("organizationId")) WITH CHECK (is_org_admin("organizationId"));

CREATE POLICY org_member_delete ON "OrganizationMember" FOR DELETE TO app_rw, authenticated
  USING (is_org_admin("organizationId"));

-- ---------- Sub-org grouping ----------

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY; -- was already enabled with zero policies (orphaned); this supersedes that

CREATE POLICY team_select ON "Team" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));

CREATE POLICY team_insert ON "Team" FOR INSERT TO app_rw, authenticated
  WITH CHECK (is_org_admin("organizationId"));

CREATE POLICY team_update ON "Team" FOR UPDATE TO app_rw, authenticated
  USING (is_org_admin("organizationId")) WITH CHECK (is_org_admin("organizationId"));

CREATE POLICY team_delete ON "Team" FOR DELETE TO app_rw, authenticated
  USING (is_org_admin("organizationId"));

ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_member_select ON "TeamMember" FOR SELECT TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Team" t WHERE t.id = "TeamMember"."teamId" AND is_org_member(t."organizationId")));

CREATE POLICY team_member_insert ON "TeamMember" FOR INSERT TO app_rw, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM "Team" t WHERE t.id = "TeamMember"."teamId" AND is_org_admin(t."organizationId")));

CREATE POLICY team_member_delete ON "TeamMember" FOR DELETE TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Team" t WHERE t.id = "TeamMember"."teamId" AND is_org_admin(t."organizationId")));

-- ---------- Resource grants ----------

ALTER TABLE "InitiativeAccess" ENABLE ROW LEVEL SECURITY;

CREATE POLICY initiative_access_select ON "InitiativeAccess" FOR SELECT TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "InitiativeAccess"."initiativeId" AND is_org_member(i."organizationId")));

CREATE POLICY initiative_access_insert ON "InitiativeAccess" FOR INSERT TO app_rw, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "InitiativeAccess"."initiativeId" AND is_org_admin(i."organizationId")));

CREATE POLICY initiative_access_update ON "InitiativeAccess" FOR UPDATE TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "InitiativeAccess"."initiativeId" AND is_org_admin(i."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "InitiativeAccess"."initiativeId" AND is_org_admin(i."organizationId")));

CREATE POLICY initiative_access_delete ON "InitiativeAccess" FOR DELETE TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "InitiativeAccess"."initiativeId" AND is_org_admin(i."organizationId")));

-- ---------- Org-scoped domain rows (direct organizationId column) ----------

ALTER TABLE "Initiative" ENABLE ROW LEVEL SECURITY;

CREATE POLICY initiative_all ON "Initiative" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_connection_all ON "IntegrationConnection" FOR ALL TO app_rw, authenticated
  USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

ALTER TABLE "DashboardConfiguration" ENABLE ROW LEVEL SECURITY;

CREATE POLICY dashboard_configuration_select ON "DashboardConfiguration" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));

CREATE POLICY dashboard_configuration_write ON "DashboardConfiguration" FOR INSERT TO app_rw, authenticated
  WITH CHECK (is_org_admin("organizationId"));

CREATE POLICY dashboard_configuration_update ON "DashboardConfiguration" FOR UPDATE TO app_rw, authenticated
  USING (is_org_admin("organizationId")) WITH CHECK (is_org_admin("organizationId"));

CREATE POLICY dashboard_configuration_delete ON "DashboardConfiguration" FOR DELETE TO app_rw, authenticated
  USING (is_org_admin("organizationId"));

ALTER TABLE "AiUsageEvent" ENABLE ROW LEVEL SECURITY;

-- Append-only audit log (see its own doc comment in schema.prisma) — SELECT
-- and INSERT only, deliberately no UPDATE/DELETE policy for anyone.
CREATE POLICY ai_usage_event_select ON "AiUsageEvent" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));

CREATE POLICY ai_usage_event_insert ON "AiUsageEvent" FOR INSERT TO app_rw, authenticated
  WITH CHECK (is_org_member("organizationId"));

ALTER TABLE "AiRequestLock" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_request_lock_select ON "AiRequestLock" FOR SELECT TO app_rw, authenticated
  USING (is_org_member("organizationId"));

CREATE POLICY ai_request_lock_insert ON "AiRequestLock" FOR INSERT TO app_rw, authenticated
  WITH CHECK (is_org_member("organizationId"));

CREATE POLICY ai_request_lock_delete ON "AiRequestLock" FOR DELETE TO app_rw, authenticated
  USING (is_org_member("organizationId"));

-- ---------- Child-of-initiative tables (walk the FK chain to Initiative.organizationId) ----------

ALTER TABLE "IntakeAnswerSet" ENABLE ROW LEVEL SECURITY;

CREATE POLICY intake_answer_set_all ON "IntakeAnswerSet" FOR ALL TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "IntakeAnswerSet"."initiativeId" AND is_org_member(i."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "IntakeAnswerSet"."initiativeId" AND is_org_member(i."organizationId")));

ALTER TABLE "Capability" ENABLE ROW LEVEL SECURITY;

CREATE POLICY capability_all ON "Capability" FOR ALL TO app_rw, authenticated
  USING (EXISTS (
    SELECT 1 FROM "IntakeAnswerSet" ias JOIN "Initiative" i ON i.id = ias."initiativeId"
    WHERE ias.id = "Capability"."intakeAnswerSetId" AND is_org_member(i."organizationId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "IntakeAnswerSet" ias JOIN "Initiative" i ON i.id = ias."initiativeId"
    WHERE ias.id = "Capability"."intakeAnswerSetId" AND is_org_member(i."organizationId")
  ));

ALTER TABLE "CapabilityDependency" ENABLE ROW LEVEL SECURITY;

CREATE POLICY capability_dependency_all ON "CapabilityDependency" FOR ALL TO app_rw, authenticated
  USING (EXISTS (
    SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" ias ON ias.id = c."intakeAnswerSetId"
    JOIN "Initiative" i ON i.id = ias."initiativeId"
    WHERE c.id = "CapabilityDependency"."fromCapabilityId" AND is_org_member(i."organizationId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Capability" c JOIN "IntakeAnswerSet" ias ON ias.id = c."intakeAnswerSetId"
    JOIN "Initiative" i ON i.id = ias."initiativeId"
    WHERE c.id = "CapabilityDependency"."fromCapabilityId" AND is_org_member(i."organizationId")
  ));

ALTER TABLE "Prototype" ENABLE ROW LEVEL SECURITY;

CREATE POLICY prototype_all ON "Prototype" FOR ALL TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "Prototype"."initiativeId" AND is_org_member(i."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "Prototype"."initiativeId" AND is_org_member(i."organizationId")));

ALTER TABLE "LayerLock" ENABLE ROW LEVEL SECURITY;

CREATE POLICY layer_lock_all ON "LayerLock" FOR ALL TO app_rw, authenticated
  USING (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "LayerLock"."prototypeId" AND is_org_member(i."organizationId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "LayerLock"."prototypeId" AND is_org_member(i."organizationId")
  ));

ALTER TABLE "ArtifactLayer" ENABLE ROW LEVEL SECURITY;

CREATE POLICY artifact_layer_all ON "ArtifactLayer" FOR ALL TO app_rw, authenticated
  USING (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "ArtifactLayer"."prototypeId" AND is_org_member(i."organizationId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "ArtifactLayer"."prototypeId" AND is_org_member(i."organizationId")
  ));

ALTER TABLE "Sprint" ENABLE ROW LEVEL SECURITY;

CREATE POLICY sprint_all ON "Sprint" FOR ALL TO app_rw, authenticated
  USING (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "Sprint"."prototypeId" AND is_org_member(i."organizationId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "Sprint"."prototypeId" AND is_org_member(i."organizationId")
  ));

ALTER TABLE "Release" ENABLE ROW LEVEL SECURITY;

CREATE POLICY release_all ON "Release" FOR ALL TO app_rw, authenticated
  USING (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "Release"."prototypeId" AND is_org_member(i."organizationId")
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Prototype" p JOIN "Initiative" i ON i.id = p."initiativeId"
    WHERE p.id = "Release"."prototypeId" AND is_org_member(i."organizationId")
  ));

ALTER TABLE "SyncConnection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_connection_all ON "SyncConnection" FOR ALL TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "SyncConnection"."initiativeId" AND is_org_member(i."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "SyncConnection"."initiativeId" AND is_org_member(i."organizationId")));

ALTER TABLE "IntegrationSyncLog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_sync_log_all ON "IntegrationSyncLog" FOR ALL TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "IntegrationConnection" c WHERE c.id = "IntegrationSyncLog"."connectionId" AND is_org_member(c."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "IntegrationConnection" c WHERE c.id = "IntegrationSyncLog"."connectionId" AND is_org_member(c."organizationId")));

ALTER TABLE "IntakeAiAnalysis" ENABLE ROW LEVEL SECURITY;

CREATE POLICY intake_ai_analysis_all ON "IntakeAiAnalysis" FOR ALL TO app_rw, authenticated
  USING (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "IntakeAiAnalysis"."initiativeId" AND is_org_member(i."organizationId")))
  WITH CHECK (EXISTS (SELECT 1 FROM "Initiative" i WHERE i.id = "IntakeAiAnalysis"."initiativeId" AND is_org_member(i."organizationId")));

-- ---------- Personal record ----------

ALTER TABLE "QualifyingProfile" ENABLE ROW LEVEL SECURITY;

CREATE POLICY qualifying_profile_all ON "QualifyingProfile" FOR ALL TO app_rw, authenticated
  USING ("userId" = current_app_user_id()) WITH CHECK ("userId" = current_app_user_id());

-- ---------- Global catalog (read by anyone signed in; the app also
-- lazily upserts these via ensureProvidersSeeded()/ensureAiCapabilitiesSeeded()
-- from a normal request, so INSERT/UPDATE need to be open too — the seed data
-- itself is static, hardcoded content, never attacker-controlled input) ----------

ALTER TABLE "AiCapability" ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_capability_select ON "AiCapability" FOR SELECT TO app_rw, authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY ai_capability_write ON "AiCapability" FOR INSERT TO app_rw, authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY ai_capability_update ON "AiCapability" FOR UPDATE TO app_rw, authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE "IntegrationProvider" ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_provider_select ON "IntegrationProvider" FOR SELECT TO app_rw, authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY integration_provider_write ON "IntegrationProvider" FOR INSERT TO app_rw, authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY integration_provider_update ON "IntegrationProvider" FOR UPDATE TO app_rw, authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE "IntegrationCapability" ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_capability_select ON "IntegrationCapability" FOR SELECT TO app_rw, authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY integration_capability_write ON "IntegrationCapability" FOR INSERT TO app_rw, authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY integration_capability_update ON "IntegrationCapability" FOR UPDATE TO app_rw, authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
