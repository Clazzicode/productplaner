ALTER TABLE public."JiraImportRun" ADD COLUMN "connectionRevision" integer;
ALTER TABLE public."JiraImportItem" ADD COLUMN "reviewSnapshot" jsonb;
ALTER TABLE public."JiraExternalLink" ADD COLUMN "fieldBaselines" jsonb;
ALTER TABLE public."JiraExportItem" ADD COLUMN "reviewSnapshot" jsonb;

-- Retain only per-field hashes on long-lived external mappings, never source prose.
CREATE FUNCTION app_private.validate_jira_field_hashes() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE field record;
BEGIN
  IF NEW."fieldBaselines" IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW."fieldBaselines")<>'object' THEN RAISE EXCEPTION 'Field baselines must be hashes'; END IF;
  FOR field IN SELECT * FROM jsonb_each(NEW."fieldBaselines") LOOP
    IF field.key NOT IN ('summary','description','points','observedBehavior','planningStatus')
      OR jsonb_typeof(field.value)<>'object' OR NOT (field.value ?& ARRAY['sourceHash','localHash'])
      OR (SELECT count(*) FROM jsonb_object_keys(field.value))<>2
      OR jsonb_typeof(field.value->'sourceHash') IS DISTINCT FROM 'string'
      OR jsonb_typeof(field.value->'localHash') IS DISTINCT FROM 'string'
      OR (field.value->>'sourceHash') !~ '^[a-f0-9]{64}$' OR (field.value->>'localHash') !~ '^[a-f0-9]{64}$'
    THEN RAISE EXCEPTION 'Field baselines must contain only source/local hashes'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.validate_jira_field_hashes() FROM PUBLIC;
CREATE TRIGGER jira_field_hashes BEFORE INSERT OR UPDATE OF "fieldBaselines" ON public."JiraExternalLink"
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_jira_field_hashes();

CREATE FUNCTION app_private.require_jira_review_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW."connectionRevision" IS DISTINCT FROM OLD."connectionRevision" THEN
    RAISE EXCEPTION 'Jira review connection revision is immutable';
  END IF;
  IF OLD.status='previewed' AND NEW.status='applying' AND NEW."connectionRevision" IS NULL THEN
    RAISE EXCEPTION 'Refresh this legacy import preview before applying it' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.require_jira_review_revision() FROM PUBLIC;
CREATE TRIGGER jira_import_review_revision BEFORE UPDATE ON public."JiraImportRun"
  FOR EACH ROW EXECUTE FUNCTION app_private.require_jira_review_revision();

-- Review content is frozen; status/selected/target ID may change during apply.
CREATE FUNCTION app_private.protect_jira_field_review() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW."reviewSnapshot" IS DISTINCT FROM OLD."reviewSnapshot" THEN
    -- Only erasure after the existing source-retention period or disconnection.
    IF TG_TABLE_NAME='JiraExportItem' THEN
    IF NEW."reviewSnapshot" IS NULL AND (
      OLD."createdAt" < now()-interval '30 days' OR EXISTS (
        SELECT 1 FROM public."JiraExportRun" r JOIN public."JiraConnection" c ON c.id=r."connectionId"
        WHERE r.id=OLD."exportRunId" AND c.status='revoked'
      )
    ) THEN RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'Jira field review is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.protect_jira_field_review() FROM PUBLIC;
CREATE TRIGGER jira_import_field_review_immutable BEFORE UPDATE OF "reviewSnapshot" ON public."JiraImportItem"
FOR EACH ROW EXECUTE FUNCTION app_private.protect_jira_field_review();
CREATE TRIGGER jira_export_field_review_immutable BEFORE UPDATE OF "reviewSnapshot" ON public."JiraExportItem"
FOR EACH ROW EXECUTE FUNCTION app_private.protect_jira_field_review();

-- Extend the existing erasure contract to comparison snapshots.
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

  UPDATE public."JiraExportItem" SET "resultSnapshot" = NULL, "reviewSnapshot" = NULL
    WHERE "createdAt" < now() - interval '30 days'
      AND ("resultSnapshot" IS NOT NULL OR "reviewSnapshot" IS NOT NULL);

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
  UPDATE public."JiraExportItem" SET "resultSnapshot" = NULL, "reviewSnapshot" = NULL
    WHERE "exportRunId" IN (SELECT id FROM public."JiraExportRun" WHERE "connectionId" = p_connection_id)
      AND ("resultSnapshot" IS NOT NULL OR "reviewSnapshot" IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION app_private.expire_jira_source_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.purge_jira_source_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.expire_jira_source_data() TO app_rw;
GRANT EXECUTE ON FUNCTION app_private.purge_jira_source_data(text) TO app_rw;
