ALTER TABLE public."JiraSyncJob" DROP CONSTRAINT IF EXISTS "JiraSyncJob_jobType_check";
ALTER TABLE public."JiraSyncJob" ADD CONSTRAINT "JiraSyncJob_jobType_check"
  CHECK ("jobType" IN ('import_preview','webhook_import','export_item','renew_webhook','delivery_reconcile'));

-- The scheduled worker has no end-user session. This private function selects
-- eligible connections without exposing connection rows or credentials.
CREATE OR REPLACE FUNCTION app_private.enqueue_due_jira_delivery_reconciliation(p_limit INTEGER DEFAULT 10)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  WITH eligible AS (
    SELECT c.id, c."organizationId", c."initiativeId"
    FROM "JiraConnection" c
    WHERE c.status = 'connected' AND c."initiativeId" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "JiraExternalLink" l WHERE l."connectionId" = c.id)
      AND NOT EXISTS (
        SELECT 1 FROM "JiraSyncJob" j WHERE j."connectionId" = c.id
          AND j."jobType" = 'delivery_reconcile' AND j.status IN ('queued','processing')
      )
      AND COALESCE((SELECT MAX(j."createdAt") FROM "JiraSyncJob" j
        WHERE j."connectionId" = c.id AND j."jobType" = 'delivery_reconcile'), '-infinity'::timestamp)
        < now() - interval '5 minutes'
    ORDER BY c."updatedAt" LIMIT LEAST(GREATEST(p_limit, 1), 25)
  ), inserted AS (
    INSERT INTO "JiraSyncJob" (id,"organizationId","initiativeId","connectionId","jobType",payload,"idempotencyKey",status,"updatedAt")
    SELECT gen_random_uuid()::text,e."organizationId",e."initiativeId",e.id,
      'delivery_reconcile','{}'::jsonb,
      md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),'queued',now()
    FROM eligible e RETURNING id
  ) SELECT COUNT(*) INTO v_count FROM inserted;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION app_private.enqueue_due_jira_delivery_reconciliation(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.enqueue_due_jira_delivery_reconciliation(INTEGER) TO app_rw;
