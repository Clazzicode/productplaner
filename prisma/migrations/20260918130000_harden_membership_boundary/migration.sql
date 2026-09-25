-- Additive bootstrap provenance: legacy organizations remain NULL and cannot
-- be claimed through self-enrollment. No existing memberships are rewritten.
ALTER TABLE "Organization" ADD COLUMN "createdByAuthUserId" UUID DEFAULT auth.uid();

DROP POLICY organization_select ON "Organization";
CREATE POLICY organization_select ON "Organization" FOR SELECT TO app_rw, authenticated
  USING (is_org_member(id) OR ("ownerUserId" IS NULL AND "createdByAuthUserId" = auth.uid()));
DROP POLICY organization_insert ON "Organization";
CREATE POLICY organization_insert ON "Organization" FOR INSERT TO app_rw
  WITH CHECK (auth.uid() IS NOT NULL AND "createdByAuthUserId" = auth.uid() AND "ownerUserId" IS NULL);

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO app_rw;

CREATE FUNCTION app_private.can_bootstrap_organization(org_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public."Organization" o WHERE o.id = org_id
      AND o."createdByAuthUserId" = auth.uid() AND o."ownerUserId" IS NULL
      AND NOT EXISTS (SELECT 1 FROM public."OrganizationMember" m WHERE m."organizationId" = org_id)
  );
$$;
REVOKE ALL ON FUNCTION app_private.can_bootstrap_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_bootstrap_organization(text) TO app_rw;

DROP POLICY org_member_insert ON "OrganizationMember";
CREATE POLICY org_member_insert ON "OrganizationMember" FOR INSERT TO app_rw
  WITH CHECK (
    ("authUserId" = auth.uid() AND role = 'owner' AND status = 'active'
      AND app_private.can_bootstrap_organization("organizationId"))
    OR is_org_owner("organizationId")
    OR (is_org_admin("organizationId") AND role = 'member')
  );
DROP POLICY org_member_update ON "OrganizationMember";
CREATE POLICY org_member_update ON "OrganizationMember" FOR UPDATE TO app_rw
  USING (is_org_owner("organizationId") OR (is_org_admin("organizationId") AND role = 'member'))
  WITH CHECK (is_org_owner("organizationId") OR (is_org_admin("organizationId") AND role = 'member'));
DROP POLICY org_member_delete ON "OrganizationMember";
CREATE POLICY org_member_delete ON "OrganizationMember" FOR DELETE TO app_rw
  USING (is_org_owner("organizationId") OR (is_org_admin("organizationId") AND role = 'member'));

ALTER TABLE "OrganizationMember" ADD CONSTRAINT organization_member_role_check
  CHECK (role IN ('owner', 'admin', 'member')) NOT VALID;
ALTER TABLE "OrganizationMember" VALIDATE CONSTRAINT organization_member_role_check;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT organization_member_status_check
  CHECK (status IN ('active', 'disabled')) NOT VALID;
ALTER TABLE "OrganizationMember" VALIDATE CONSTRAINT organization_member_status_check;

-- Browser access is through authenticated Next.js routes, never direct
-- PostgREST writes. Otherwise client roles bypass the application's finer
-- initiative grants, governance and audit services. app_rw retains RLS.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

CREATE FUNCTION app_private.protect_identity_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user <> 'app_rw' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'Organization' THEN
    IF NEW."createdByAuthUserId" IS DISTINCT FROM OLD."createdByAuthUserId" THEN
      RAISE EXCEPTION 'Organization provenance is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'User' THEN
    IF NEW."authUserId" IS DISTINCT FROM OLD."authUserId" OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
      RAISE EXCEPTION 'Identity reassignment requires an administrative migration';
    END IF;
  ELSIF TG_TABLE_NAME = 'OrganizationMember' THEN
    IF NEW."authUserId" IS DISTINCT FROM OLD."authUserId" OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN
      RAISE EXCEPTION 'Membership identity is immutable';
    END IF;
    IF OLD.role = 'owner' AND OLD.status = 'active' AND (NEW.role <> 'owner' OR NEW.status <> 'active') THEN
      RAISE EXCEPTION 'Owner transfer requires a dedicated ownership workflow';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.protect_identity_columns() FROM PUBLIC;
CREATE TRIGGER protect_org_identity BEFORE UPDATE ON "Organization"
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_identity_columns();
CREATE TRIGGER protect_user_identity BEFORE UPDATE ON "User"
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_identity_columns();
CREATE TRIGGER protect_membership_identity BEFORE UPDATE ON "OrganizationMember"
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_identity_columns();
