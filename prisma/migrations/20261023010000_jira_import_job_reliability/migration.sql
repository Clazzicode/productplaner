ALTER TABLE "JiraConnection"
  ADD COLUMN "lastSyncAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncStatus" TEXT;

ALTER TABLE "JiraImportRun"
  ADD COLUMN "sourceJobId" TEXT,
  ADD COLUMN "readStartedAt" TIMESTAMP(3),
  ADD COLUMN "readCompletedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "JiraImportRun_sourceJobId_key" ON "JiraImportRun"("sourceJobId");
ALTER TABLE "JiraImportRun"
  ADD CONSTRAINT "JiraImportRun_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "JiraSyncJob"("id") ON DELETE SET NULL;

ALTER TABLE "JiraExternalLink"
  ADD COLUMN "lastSyncStatus" TEXT NOT NULL DEFAULT 'imported';
ALTER TABLE "JiraExternalLink" ADD CONSTRAINT "JiraExternalLink_lastSyncStatus_check"
  CHECK ("lastSyncStatus" IN ('imported','unchanged','update_available','conflict','skipped'));

ALTER TABLE "JiraSyncJob" DROP CONSTRAINT IF EXISTS "JiraSyncJob_jobType_check";
ALTER TABLE "JiraSyncJob" ADD CONSTRAINT "JiraSyncJob_jobType_check"
  CHECK ("jobType" IN ('import_preview','webhook_import','export_item','renew_webhook'));
CREATE UNIQUE INDEX "JiraSyncJob_active_import_preview_key"
  ON "JiraSyncJob"("connectionId")
  WHERE "jobType"='import_preview' AND status IN ('queued','processing');

-- Reclaims consume an attempt too. Otherwise a repeatedly crashed worker can
-- reclaim one job forever without ever reaching maxAttempts.
CREATE OR REPLACE FUNCTION app_private.claim_jira_jobs(p_worker TEXT,p_limit INTEGER DEFAULT 10,p_organization_id TEXT DEFAULT NULL)
RETURNS TABLE(job_id TEXT,organization_id TEXT,connection_id TEXT,actor_auth_user_id UUID) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE "JiraSyncJob" j SET status='failed',"lockedAt"=NULL,"lockedBy"=NULL,"lastError"='Worker lease expired after the final attempt.',"updatedAt"=now()
  WHERE j.status='processing' AND j."attemptCount">=j."maxAttempts" AND j."lockedAt"<now()-interval '10 minutes'
    AND (p_organization_id IS NULL OR j."organizationId"=p_organization_id);
  RETURN QUERY WITH candidates AS (
    SELECT j.id,(SELECT m."authUserId" FROM "OrganizationMember" m JOIN "User" u ON u."authUserId"=m."authUserId" WHERE m."organizationId"=j."organizationId" AND m.status='active' AND m.role IN ('owner','admin') AND u.status='active' ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END,m."createdAt" LIMIT 1) actor
    FROM "JiraSyncJob" j
    WHERE (p_organization_id IS NULL OR j."organizationId"=p_organization_id)
      AND j."attemptCount"<j."maxAttempts"
      AND ((j.status='queued' AND j."availableAt"<=now()) OR (j.status='processing' AND j."lockedAt"<now()-interval '10 minutes'))
    ORDER BY j."availableAt",j."createdAt" FOR UPDATE SKIP LOCKED LIMIT LEAST(GREATEST(p_limit,1),50)
  ), claimed AS (
    UPDATE "JiraSyncJob" j SET status='processing',"attemptCount"=j."attemptCount"+1,"lockedAt"=now(),"lockedBy"=p_worker,"updatedAt"=now()
    FROM candidates c WHERE j.id=c.id AND c.actor IS NOT NULL
    RETURNING j.id,j."organizationId",j."connectionId",c.actor
  ) SELECT id,"organizationId","connectionId",actor FROM claimed;
END $$;
