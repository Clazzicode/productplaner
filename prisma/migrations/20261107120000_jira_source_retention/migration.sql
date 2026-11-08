-- Keep source material only for the period needed to review an import. The
-- fingerprint and mapping remain while a connection is active, but the full
-- issue body is never needed on JiraExternalLink after approval.
-- The previous import trigger returned NEW on DELETE, silently suppressing
-- deletion of previews. Permit only scheduled expiry or disconnected erasure.
CREATE OR REPLACE FUNCTION public.protect_applied_jira_import()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."createdAt" < now() - interval '30 days' OR EXISTS (
      SELECT 1 FROM public."JiraConnection" c
      WHERE c.id = OLD."connectionId" AND c.status = 'revoked'
    ) THEN RETURN OLD; END IF;
    IF OLD.status IN ('applied', 'cancelled') THEN
      RAISE EXCEPTION 'Finalized Jira import is immutable';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('applied', 'cancelled') THEN
    RAISE EXCEPTION 'Finalized Jira import is immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- A resolved conflict is immutable in normal operation. Its source snapshot
-- may be scrubbed after retention, and its row may be removed only after the
-- parent connection has been revoked. app_rw has no DELETE grant on this table.
CREATE OR REPLACE FUNCTION public.protect_final_jira_conflict()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status = 'resolved' THEN
    IF TG_OP = 'DELETE' AND EXISTS (
      SELECT 1 FROM public."JiraConnection" c
      WHERE c.id = OLD."connectionId" AND c.status = 'revoked'
    ) THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND NEW."jiraSnapshot" = '{}'::jsonb
      AND (to_jsonb(NEW) - 'jiraSnapshot') = (to_jsonb(OLD) - 'jiraSnapshot')
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Resolved Jira conflict is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.expire_jira_source_data()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public."JiraImportRun" r
    USING public."JiraConnection" c
    WHERE r."connectionId" = c.id AND c.status = 'revoked';
  DELETE FROM public."JiraExternalLink" l
    USING public."JiraConnection" c
    WHERE l."connectionId" = c.id AND c.status = 'revoked';
  DELETE FROM public."JiraWebhookEvent" e
    USING public."JiraConnection" c
    WHERE e."connectionId" = c.id AND c.status = 'revoked';
  DELETE FROM public."JiraSyncJob" j
    USING public."JiraConnection" c
    WHERE j."connectionId" = c.id AND c.status = 'revoked';
  DELETE FROM public."JiraWebhookSubscription" s
    USING public."JiraConnection" c
    WHERE s."connectionId" = c.id AND c.status = 'revoked';

  DELETE FROM public."JiraImportRun"
    WHERE "createdAt" < now() - interval '30 days';

  DELETE FROM public."JiraWebhookEvent"
    WHERE "receivedAt" < now() - interval '7 days'
      AND status IN ('processed', 'ignored', 'failed');

  UPDATE public."JiraExternalLink" SET "lastImportedSnapshot" = '{}'::jsonb
    WHERE "lastImportedAt" < now() - interval '30 days'
      AND "lastImportedSnapshot" <> '{}'::jsonb;

  UPDATE public."JiraSyncConflict" SET "jiraSnapshot" = '{}'::jsonb
    WHERE "createdAt" < now() - interval '30 days'
      AND "jiraSnapshot" <> '{}'::jsonb;

  UPDATE public."JiraExportItem" SET "resultSnapshot" = NULL
    WHERE "createdAt" < now() - interval '30 days'
      AND "resultSnapshot" IS NOT NULL;

  DELETE FROM public."JiraSyncJob"
    WHERE "updatedAt" < now() - interval '90 days'
      AND status IN ('completed', 'failed', 'cancelled');

  DELETE FROM public."JiraOAuthState"
    WHERE "expiresAt" < now() - interval '7 days';
END;
$$;

-- Called only after local token revocation in the same transaction. Planning
-- records and immutable audit/export approval evidence are deliberately kept.
CREATE OR REPLACE FUNCTION app_private.purge_jira_source_data(p_connection_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id text;
  v_status text;
BEGIN
  SELECT "organizationId", status INTO v_org_id, v_status
    FROM public."JiraConnection" WHERE id = p_connection_id FOR UPDATE;
  IF v_org_id IS NULL OR NOT public.is_org_admin(v_org_id) THEN
    RAISE EXCEPTION 'Jira connection not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'revoked' THEN
    RAISE EXCEPTION 'Disconnect Jira before removing source data' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public."JiraImportRun" WHERE "connectionId" = p_connection_id;
  DELETE FROM public."JiraExternalLink" WHERE "connectionId" = p_connection_id;
  DELETE FROM public."JiraWebhookEvent" WHERE "connectionId" = p_connection_id;
  DELETE FROM public."JiraSyncJob" WHERE "connectionId" = p_connection_id;
  DELETE FROM public."JiraWebhookSubscription" WHERE "connectionId" = p_connection_id;
  UPDATE public."JiraExportItem" SET "resultSnapshot" = NULL
    WHERE "exportRunId" IN (SELECT id FROM public."JiraExportRun" WHERE "connectionId" = p_connection_id)
      AND "resultSnapshot" IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION app_private.expire_jira_source_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.purge_jira_source_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.expire_jira_source_data() TO app_rw;
GRANT EXECUTE ON FUNCTION app_private.purge_jira_source_data(text) TO app_rw;
