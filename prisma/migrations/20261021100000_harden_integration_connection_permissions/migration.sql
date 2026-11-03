-- Integrations are workspace-owned resources, created/configured by an
-- authenticated workspace owner or admin. Members may see connection state
-- and history but must not be able to create, reconfigure, or disconnect a
-- provider by bypassing the API route's role checks.

DROP POLICY IF EXISTS integration_connection_all ON "IntegrationConnection";

CREATE POLICY integration_connection_select ON "IntegrationConnection"
  FOR SELECT TO app_rw
  USING (is_org_member("organizationId"));

CREATE POLICY integration_connection_insert ON "IntegrationConnection"
  FOR INSERT TO app_rw
  WITH CHECK (
    is_org_admin("organizationId")
    AND "configuredByUserId" = current_app_user_id()
  );

CREATE POLICY integration_connection_update ON "IntegrationConnection"
  FOR UPDATE TO app_rw
  USING (is_org_admin("organizationId"))
  WITH CHECK (is_org_admin("organizationId"));

CREATE POLICY integration_connection_delete ON "IntegrationConnection"
  FOR DELETE TO app_rw
  USING (is_org_admin("organizationId"));

-- A connection's tenant/provider/scope are its identity. Reconfiguration
-- changes settings/status, never silently transfers that identity elsewhere.
CREATE FUNCTION app_private.prevent_integration_connection_reassignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
     OR NEW."providerId" IS DISTINCT FROM OLD."providerId"
     OR NEW."initiativeId" IS DISTINCT FROM OLD."initiativeId" THEN
    RAISE EXCEPTION 'Integration connection workspace, provider, and scope are immutable';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.prevent_integration_connection_reassignment() FROM PUBLIC;

CREATE TRIGGER prevent_integration_connection_reassignment
  BEFORE UPDATE ON "IntegrationConnection"
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_integration_connection_reassignment();

-- Sync history is evidence, not mutable connection state. Any workspace
-- member may read it; only workspace admins may append a log record.
DROP POLICY IF EXISTS integration_sync_log_all ON "IntegrationSyncLog";

CREATE POLICY integration_sync_log_select ON "IntegrationSyncLog"
  FOR SELECT TO app_rw
  USING (EXISTS (
    SELECT 1 FROM "IntegrationConnection" c
    WHERE c.id = "IntegrationSyncLog"."connectionId"
      AND is_org_member(c."organizationId")
  ));

CREATE POLICY integration_sync_log_insert ON "IntegrationSyncLog"
  FOR INSERT TO app_rw
  WITH CHECK (EXISTS (
    SELECT 1 FROM "IntegrationConnection" c
    WHERE c.id = "IntegrationSyncLog"."connectionId"
      AND is_org_admin(c."organizationId")
  ));
