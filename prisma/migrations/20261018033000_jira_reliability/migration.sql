CREATE TABLE "JiraWebhookSubscription" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,"externalId" TEXT NOT NULL,"callbackSecretHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',"expiresAt" TIMESTAMP(3) NOT NULL,"lastRenewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "JiraWebhookSubscription_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraWebhookEvent" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,"externalEventId" TEXT NOT NULL,"eventType" TEXT NOT NULL,
  "externalIssueId" TEXT,"externalKey" TEXT,"payloadHash" TEXT NOT NULL,"payload" JSONB NOT NULL,"status" TEXT NOT NULL DEFAULT 'received',
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"processedAt" TIMESTAMP(3),"failureMessage" TEXT,
  CONSTRAINT "JiraWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraSyncJob" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"initiativeId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,"jobType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,"idempotencyKey" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'queued',"attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,"availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lockedAt" TIMESTAMP(3),"lockedBy" TEXT,
  "completedAt" TIMESTAMP(3),"lastError" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraSyncJob_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraSyncAttempt" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"jobId" TEXT NOT NULL,"attemptNumber" INTEGER NOT NULL,"status" TEXT NOT NULL,
  "errorMessage" TEXT,"startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"finishedAt" TIMESTAMP(3),CONSTRAINT "JiraSyncAttempt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "JiraSyncConflict" (
  "id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"initiativeId" TEXT NOT NULL,"connectionId" TEXT NOT NULL,"externalLinkId" TEXT NOT NULL,
  "importItemId" TEXT,"exportItemId" TEXT,"targetType" TEXT NOT NULL,"targetId" TEXT NOT NULL,"externalIssueId" TEXT NOT NULL,"externalKey" TEXT NOT NULL,
  "baselineSourceHash" TEXT NOT NULL,"baselineTargetHash" TEXT NOT NULL,"jiraFingerprint" TEXT NOT NULL,"planningFingerprint" TEXT NOT NULL,
  "jiraSnapshot" JSONB NOT NULL,"explanation" TEXT NOT NULL,"status" TEXT NOT NULL DEFAULT 'open',"resolution" TEXT,"resolutionReason" TEXT,
  "resolvedByUserId" TEXT,"resolvedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraSyncConflict_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraWebhookSubscription_connectionId_key" ON "JiraWebhookSubscription"("connectionId");
CREATE UNIQUE INDEX "JiraWebhookSubscription_connectionId_externalId_key" ON "JiraWebhookSubscription"("connectionId","externalId");
CREATE INDEX "JiraWebhookSubscription_organizationId_expiresAt_idx" ON "JiraWebhookSubscription"("organizationId","expiresAt");
CREATE UNIQUE INDEX "JiraWebhookEvent_connectionId_externalEventId_key" ON "JiraWebhookEvent"("connectionId","externalEventId");
CREATE INDEX "JiraWebhookEvent_organizationId_receivedAt_idx" ON "JiraWebhookEvent"("organizationId","receivedAt");
CREATE UNIQUE INDEX "JiraSyncJob_idempotencyKey_key" ON "JiraSyncJob"("idempotencyKey");
CREATE INDEX "JiraSyncJob_organizationId_status_availableAt_idx" ON "JiraSyncJob"("organizationId","status","availableAt");
CREATE INDEX "JiraSyncJob_connectionId_status_createdAt_idx" ON "JiraSyncJob"("connectionId","status","createdAt");
CREATE UNIQUE INDEX "JiraSyncAttempt_jobId_attemptNumber_key" ON "JiraSyncAttempt"("jobId","attemptNumber");
CREATE INDEX "JiraSyncAttempt_organizationId_startedAt_idx" ON "JiraSyncAttempt"("organizationId","startedAt");
CREATE INDEX "JiraSyncConflict_organizationId_initiativeId_status_createdAt_idx" ON "JiraSyncConflict"("organizationId","initiativeId","status","createdAt");
CREATE INDEX "JiraSyncConflict_connectionId_externalIssueId_status_idx" ON "JiraSyncConflict"("connectionId","externalIssueId","status");
CREATE UNIQUE INDEX "JiraSyncConflict_open_version_key" ON "JiraSyncConflict"("connectionId","externalIssueId","jiraFingerprint","planningFingerprint") WHERE status='open';

ALTER TABLE "JiraWebhookSubscription" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("connectionId") REFERENCES "JiraConnection"("id") ON DELETE CASCADE;
ALTER TABLE "JiraWebhookEvent" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("connectionId") REFERENCES "JiraConnection"("id") ON DELETE CASCADE;
ALTER TABLE "JiraSyncJob" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("connectionId") REFERENCES "JiraConnection"("id") ON DELETE CASCADE;
ALTER TABLE "JiraSyncAttempt" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("jobId") REFERENCES "JiraSyncJob"("id") ON DELETE CASCADE;
ALTER TABLE "JiraSyncConflict" ADD FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("connectionId") REFERENCES "JiraConnection"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("externalLinkId") REFERENCES "JiraExternalLink"("id") ON DELETE CASCADE,ADD FOREIGN KEY ("importItemId") REFERENCES "JiraImportItem"("id") ON DELETE SET NULL,ADD FOREIGN KEY ("exportItemId") REFERENCES "JiraExportItem"("id") ON DELETE SET NULL,ADD FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "JiraWebhookSubscription" ADD CHECK ("status" IN ('active','renewal_required','disabled')),ADD CHECK (char_length("callbackSecretHash")=64);
ALTER TABLE "JiraWebhookEvent" ADD CHECK ("status" IN ('received','queued','processed','ignored','failed')),ADD CHECK (char_length("payloadHash")=64);
ALTER TABLE "JiraSyncJob" ADD CHECK ("jobType" IN ('webhook_import','export_item','renew_webhook')),ADD CHECK ("status" IN ('queued','processing','completed','failed','cancelled')),ADD CHECK (char_length("idempotencyKey")=64),ADD CHECK ("attemptCount">=0 AND "maxAttempts" BETWEEN 1 AND 20 AND "attemptCount"<="maxAttempts");
ALTER TABLE "JiraSyncAttempt" ADD CHECK ("attemptNumber">0),ADD CHECK ("status" IN ('processing','succeeded','retry_scheduled','failed'));
ALTER TABLE "JiraSyncConflict" ADD CHECK ("targetType" IN ('feature','story','bug')),ADD CHECK ("status" IN ('open','resolved')),ADD CHECK ("resolution" IS NULL OR "resolution" IN ('keep_planning','accept_jira','manual')),ADD CHECK (char_length("baselineSourceHash")=64),ADD CHECK (char_length("baselineTargetHash")=64),ADD CHECK (char_length("jiraFingerprint")=64),ADD CHECK (char_length("planningFingerprint")=64),ADD CHECK (("status"='open' AND "resolution" IS NULL AND "resolvedAt" IS NULL) OR ("status"='resolved' AND "resolution" IS NOT NULL AND char_length(trim("resolutionReason"))>=5 AND "resolvedAt" IS NOT NULL));

CREATE FUNCTION validate_jira_connection_child() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_org TEXT; BEGIN SELECT "organizationId" INTO parent_org FROM "JiraConnection" WHERE id=NEW."connectionId"; IF parent_org IS NULL OR parent_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Jira connection child tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_webhook_subscription_parent BEFORE INSERT OR UPDATE ON "JiraWebhookSubscription" FOR EACH ROW EXECUTE FUNCTION validate_jira_connection_child();
CREATE TRIGGER jira_webhook_event_parent BEFORE INSERT OR UPDATE ON "JiraWebhookEvent" FOR EACH ROW EXECUTE FUNCTION validate_jira_connection_child();
CREATE TRIGGER jira_sync_job_connection_parent BEFORE INSERT OR UPDATE ON "JiraSyncJob" FOR EACH ROW EXECUTE FUNCTION validate_jira_connection_child();
CREATE TRIGGER jira_sync_conflict_connection_parent BEFORE INSERT OR UPDATE ON "JiraSyncConflict" FOR EACH ROW EXECUTE FUNCTION validate_jira_connection_child();
CREATE FUNCTION validate_jira_sync_attempt_parent() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE parent_org TEXT; BEGIN SELECT "organizationId" INTO parent_org FROM "JiraSyncJob" WHERE id=NEW."jobId"; IF parent_org IS NULL OR parent_org<>NEW."organizationId" THEN RAISE EXCEPTION 'Jira sync attempt tenant mismatch'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_sync_attempt_parent BEFORE INSERT OR UPDATE ON "JiraSyncAttempt" FOR EACH ROW EXECUTE FUNCTION validate_jira_sync_attempt_parent();
CREATE FUNCTION protect_final_jira_conflict() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='resolved' THEN RAISE EXCEPTION 'Resolved Jira conflict is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER jira_sync_conflict_resolved_immutable BEFORE UPDATE OR DELETE ON "JiraSyncConflict" FOR EACH ROW EXECUTE FUNCTION protect_final_jira_conflict();
CREATE TRIGGER jira_sync_attempt_immutable BEFORE UPDATE OR DELETE ON "JiraSyncAttempt" FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

ALTER TABLE "JiraWebhookSubscription" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraWebhookEvent" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraSyncJob" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraSyncAttempt" ENABLE ROW LEVEL SECURITY;ALTER TABLE "JiraSyncConflict" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "JiraWebhookSubscription","JiraWebhookEvent","JiraSyncJob","JiraSyncAttempt","JiraSyncConflict" FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON "JiraWebhookSubscription","JiraWebhookEvent","JiraSyncJob","JiraSyncConflict" TO app_rw;
GRANT SELECT,INSERT ON "JiraSyncAttempt" TO app_rw;
CREATE POLICY jira_webhook_subscription_all ON "JiraWebhookSubscription" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_webhook_event_all ON "JiraWebhookEvent" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_sync_job_all ON "JiraSyncJob" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_sync_attempt_select ON "JiraSyncAttempt" FOR SELECT TO app_rw USING (is_org_member("organizationId"));
CREATE POLICY jira_sync_attempt_insert ON "JiraSyncAttempt" FOR INSERT TO app_rw WITH CHECK (is_org_member("organizationId"));
CREATE POLICY jira_sync_conflict_all ON "JiraSyncConflict" FOR ALL TO app_rw USING (is_org_member("organizationId")) WITH CHECK (is_org_member("organizationId"));

CREATE FUNCTION app_private.enqueue_jira_webhook(p_connection_id TEXT,p_secret_hash TEXT,p_external_event_id TEXT,p_event_type TEXT,p_issue_id TEXT,p_issue_key TEXT,p_payload_hash TEXT,p_payload JSONB)
RETURNS TABLE(event_id TEXT,created BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_org TEXT;v_initiative TEXT;v_event TEXT;v_created BOOLEAN:=false;
BEGIN
  SELECT c."organizationId",c."initiativeId" INTO v_org,v_initiative FROM "JiraConnection" c JOIN "JiraWebhookSubscription" s ON s."connectionId"=c.id WHERE c.id=p_connection_id AND c.status='connected' AND s.status='active' AND s."callbackSecretHash"=p_secret_hash;
  IF v_org IS NULL OR v_initiative IS NULL THEN RAISE EXCEPTION 'Invalid Jira webhook'; END IF;
  INSERT INTO "JiraWebhookEvent" (id,"organizationId","connectionId","externalEventId","eventType","externalIssueId","externalKey","payloadHash",payload,status)
  VALUES (gen_random_uuid()::text,v_org,p_connection_id,p_external_event_id,p_event_type,p_issue_id,p_issue_key,p_payload_hash,p_payload,'queued') ON CONFLICT ("connectionId","externalEventId") DO NOTHING RETURNING id INTO v_event;
  IF v_event IS NOT NULL THEN
    v_created:=true;
    INSERT INTO "JiraSyncJob" (id,"organizationId","initiativeId","connectionId","jobType",payload,"idempotencyKey",status,"updatedAt") VALUES (gen_random_uuid()::text,v_org,v_initiative,p_connection_id,'webhook_import',jsonb_build_object('webhookEventId',v_event),md5('webhook:'||v_event)||md5('webhook:2:'||v_event),'queued',now());
  ELSE SELECT id INTO v_event FROM "JiraWebhookEvent" WHERE "connectionId"=p_connection_id AND "externalEventId"=p_external_event_id; END IF;
  RETURN QUERY SELECT v_event,v_created;
END $$;
REVOKE ALL ON FUNCTION app_private.enqueue_jira_webhook(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.enqueue_jira_webhook(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB) TO app_rw;

CREATE FUNCTION app_private.claim_jira_jobs(p_worker TEXT,p_limit INTEGER DEFAULT 10,p_organization_id TEXT DEFAULT NULL)
RETURNS TABLE(job_id TEXT,organization_id TEXT,connection_id TEXT,actor_auth_user_id UUID) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN QUERY WITH candidates AS (
    SELECT j.id,j.status old_status,(SELECT m."authUserId" FROM "OrganizationMember" m JOIN "User" u ON u."authUserId"=m."authUserId" WHERE m."organizationId"=j."organizationId" AND m.status='active' AND m.role IN ('owner','admin') AND u.status='active' ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END,m."createdAt" LIMIT 1) actor
    FROM "JiraSyncJob" j WHERE (p_organization_id IS NULL OR j."organizationId"=p_organization_id) AND ((j.status='queued' AND j."attemptCount"<j."maxAttempts" AND j."availableAt"<=now()) OR (j.status='processing' AND j."attemptCount"<=j."maxAttempts" AND j."lockedAt"<now()-interval '10 minutes')) ORDER BY j."availableAt",j."createdAt" FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),50)
  ), claimed AS (
    UPDATE "JiraSyncJob" j SET status='processing',"attemptCount"=CASE WHEN c.old_status='queued' THEN j."attemptCount"+1 ELSE j."attemptCount" END,"lockedAt"=now(),"lockedBy"=p_worker,"updatedAt"=now() FROM candidates c WHERE j.id=c.id AND c.actor IS NOT NULL RETURNING j.id,j."organizationId",j."connectionId",c.actor
  ) SELECT id,"organizationId","connectionId",actor FROM claimed;
END $$;
REVOKE ALL ON FUNCTION app_private.claim_jira_jobs(TEXT,INTEGER,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.claim_jira_jobs(TEXT,INTEGER,TEXT) TO app_rw;
