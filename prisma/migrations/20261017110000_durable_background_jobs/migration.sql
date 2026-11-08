-- Durable background jobs, transactional outbox, and webhook inbox.
-- Tables are server-only: Data API roles receive no privileges.

ALTER TABLE "RoadmapVersion" ADD COLUMN "reviewFingerprint" TEXT;
ALTER TABLE "PlanApproval" ADD COLUMN "reviewFingerprint" TEXT;
ALTER TABLE "RoadmapVersion" ADD CONSTRAINT "RoadmapVersion_review_fingerprint_check" CHECK ("reviewFingerprint" IS NULL OR char_length("reviewFingerprint") = 64);
ALTER TABLE "PlanApproval" ADD CONSTRAINT "PlanApproval_review_fingerprint_check" CHECK ("reviewFingerprint" IS NULL OR char_length("reviewFingerprint") = 64);

CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "initiatedByUserId" TEXT,
  "initiatedByAuthUserId" UUID,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "idempotencyKey" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJob_status_check" CHECK ("status" IN ('queued','running','completed','failed','dead_letter','cancelled')),
  CONSTRAINT "BackgroundJob_attempts_check" CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 20),
  CONSTRAINT "BackgroundJob_priority_check" CHECK ("priority" BETWEEN 0 AND 1000),
  CONSTRAINT "BackgroundJob_lease_check" CHECK ("status" <> 'running' OR ("leaseOwner" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL))
);

CREATE TABLE "BackgroundJobAttempt" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "workerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'running',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "BackgroundJobAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJobAttempt_status_check" CHECK ("status" IN ('running','completed','failed')),
  CONSTRAINT "BackgroundJobAttempt_number_check" CHECK ("attemptNumber" > 0)
);

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "backgroundJobId" TEXT,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "deduplicationKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxEvent_status_check" CHECK ("status" IN ('pending','published','failed')),
  CONSTRAINT "OutboxEvent_attempts_check" CHECK ("attemptCount" >= 0)
);

CREATE TABLE "WebhookInboxEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  CONSTRAINT "WebhookInboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookInboxEvent_status_check" CHECK ("status" IN ('received','processing','processed','failed','dead_letter')),
  CONSTRAINT "WebhookInboxEvent_attempts_check" CHECK ("attemptCount" >= 0)
);

ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackgroundJobAttempt" ADD CONSTRAINT "BackgroundJobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_backgroundJobId_fkey" FOREIGN KEY ("backgroundJobId") REFERENCES "BackgroundJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookInboxEvent" ADD CONSTRAINT "WebhookInboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "BackgroundJob_organizationId_type_idempotencyKey_key" ON "BackgroundJob"("organizationId", "type", "idempotencyKey");
CREATE INDEX "BackgroundJob_status_availableAt_priority_createdAt_idx" ON "BackgroundJob"("status", "availableAt", "priority", "createdAt");
CREATE INDEX "BackgroundJob_organizationId_createdAt_idx" ON "BackgroundJob"("organizationId", "createdAt");
CREATE INDEX "BackgroundJob_initiatedByUserId_createdAt_idx" ON "BackgroundJob"("initiatedByUserId", "createdAt");
CREATE UNIQUE INDEX "BackgroundJobAttempt_jobId_attemptNumber_key" ON "BackgroundJobAttempt"("jobId", "attemptNumber");
CREATE INDEX "BackgroundJobAttempt_status_startedAt_idx" ON "BackgroundJobAttempt"("status", "startedAt");
CREATE UNIQUE INDEX "OutboxEvent_organizationId_eventType_deduplicationKey_key" ON "OutboxEvent"("organizationId", "eventType", "deduplicationKey");
CREATE INDEX "OutboxEvent_status_availableAt_createdAt_idx" ON "OutboxEvent"("status", "availableAt", "createdAt");
CREATE INDEX "OutboxEvent_organizationId_createdAt_idx" ON "OutboxEvent"("organizationId", "createdAt");
CREATE INDEX "OutboxEvent_backgroundJobId_idx" ON "OutboxEvent"("backgroundJobId");
CREATE UNIQUE INDEX "WebhookInboxEvent_provider_externalEventId_key" ON "WebhookInboxEvent"("provider", "externalEventId");
CREATE INDEX "WebhookInboxEvent_status_receivedAt_idx" ON "WebhookInboxEvent"("status", "receivedAt");
CREATE INDEX "WebhookInboxEvent_organizationId_receivedAt_idx" ON "WebhookInboxEvent"("organizationId", "receivedAt");

ALTER TABLE "BackgroundJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BackgroundJobAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookInboxEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON "BackgroundJob", "BackgroundJobAttempt", "OutboxEvent", "WebhookInboxEvent" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON "BackgroundJob", "OutboxEvent", "WebhookInboxEvent" TO app_rw;
GRANT SELECT ON "BackgroundJobAttempt" TO app_rw;

CREATE POLICY background_job_select ON "BackgroundJob" FOR SELECT TO app_rw
  USING (is_org_member("organizationId"));
CREATE POLICY background_job_insert ON "BackgroundJob" FOR INSERT TO app_rw
  WITH CHECK (is_org_member("organizationId"));
CREATE POLICY background_job_attempt_select ON "BackgroundJobAttempt" FOR SELECT TO app_rw
  USING (EXISTS (SELECT 1 FROM "BackgroundJob" j WHERE j.id = "jobId" AND is_org_member(j."organizationId")));
CREATE POLICY outbox_event_select ON "OutboxEvent" FOR SELECT TO app_rw
  USING (is_org_member("organizationId"));
CREATE POLICY outbox_event_insert ON "OutboxEvent" FOR INSERT TO app_rw
  WITH CHECK (is_org_member("organizationId"));
CREATE POLICY webhook_inbox_select ON "WebhookInboxEvent" FOR SELECT TO app_rw
  USING (is_org_member("organizationId"));
CREATE POLICY webhook_inbox_insert ON "WebhookInboxEvent" FOR INSERT TO app_rw
  WITH CHECK (is_org_member("organizationId"));

CREATE OR REPLACE FUNCTION app_private.claim_background_job(p_worker_id TEXT, p_lease_seconds INTEGER DEFAULT 120)
RETURNS SETOF public."BackgroundJob"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public."BackgroundJob"%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR char_length(btrim(p_worker_id)) < 3 OR p_lease_seconds NOT BETWEEN 15 AND 900 THEN
    RAISE EXCEPTION 'Invalid worker claim parameters';
  END IF;

  SELECT * INTO claimed
  FROM public."BackgroundJob"
  WHERE (
    (status = 'queued' AND "availableAt" <= clock_timestamp())
    OR (status = 'running' AND "leaseExpiresAt" < clock_timestamp())
  )
    AND "attemptCount" < "maxAttempts"
  ORDER BY priority ASC, "availableAt" ASC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public."BackgroundJob"
  SET status = 'running',
      "leaseOwner" = p_worker_id,
      "leaseExpiresAt" = clock_timestamp() + make_interval(secs => p_lease_seconds),
      "startedAt" = COALESCE("startedAt", clock_timestamp()),
      "attemptCount" = "attemptCount" + 1,
      "updatedAt" = clock_timestamp()
  WHERE id = claimed.id
  RETURNING * INTO claimed;

  INSERT INTO public."BackgroundJobAttempt" (id, "jobId", "attemptNumber", "workerId", status, "startedAt")
  VALUES (gen_random_uuid()::text, claimed.id, claimed."attemptCount", p_worker_id, 'running', clock_timestamp());

  UPDATE public."OutboxEvent"
  SET status = 'published', "publishedAt" = COALESCE("publishedAt", clock_timestamp()),
      "attemptCount" = "attemptCount" + 1
  WHERE "backgroundJobId" = claimed.id;

  RETURN NEXT claimed;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.heartbeat_background_job(p_job_id TEXT, p_worker_id TEXT, p_lease_seconds INTEGER DEFAULT 120)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public."BackgroundJob"
  SET "leaseExpiresAt" = clock_timestamp() + make_interval(secs => p_lease_seconds),
      "updatedAt" = clock_timestamp()
  WHERE id = p_job_id AND status = 'running' AND "leaseOwner" = p_worker_id
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION app_private.complete_background_job(p_job_id TEXT, p_worker_id TEXT, p_result JSONB DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_attempt INTEGER;
BEGIN
  UPDATE public."BackgroundJob"
  SET status = 'completed', result = p_result, "completedAt" = clock_timestamp(),
      "leaseOwner" = NULL, "leaseExpiresAt" = NULL, "lastErrorCode" = NULL,
      "lastErrorMessage" = NULL, "updatedAt" = clock_timestamp()
  WHERE id = p_job_id AND status = 'running' AND "leaseOwner" = p_worker_id
  RETURNING "attemptCount" INTO current_attempt;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public."BackgroundJobAttempt"
  SET status = 'completed', "finishedAt" = clock_timestamp()
  WHERE "jobId" = p_job_id AND "attemptNumber" = current_attempt AND "workerId" = p_worker_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.fail_background_job(
  p_job_id TEXT,
  p_worker_id TEXT,
  p_error_code TEXT,
  p_error_message TEXT,
  p_retry_delay_seconds INTEGER DEFAULT 30,
  p_permanent BOOLEAN DEFAULT false
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_attempt INTEGER;
  maximum_attempts INTEGER;
  next_status TEXT;
BEGIN
  SELECT "attemptCount", "maxAttempts" INTO current_attempt, maximum_attempts
  FROM public."BackgroundJob"
  WHERE id = p_job_id AND status = 'running' AND "leaseOwner" = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  next_status := CASE WHEN p_permanent OR current_attempt >= maximum_attempts THEN 'dead_letter' ELSE 'queued' END;
  UPDATE public."BackgroundJob"
  SET status = next_status,
      "availableAt" = CASE WHEN next_status = 'queued' THEN clock_timestamp() + make_interval(secs => GREATEST(1, LEAST(p_retry_delay_seconds, 86400))) ELSE "availableAt" END,
      "leaseOwner" = NULL, "leaseExpiresAt" = NULL,
      "completedAt" = CASE WHEN next_status = 'dead_letter' THEN clock_timestamp() ELSE NULL END,
      "lastErrorCode" = left(COALESCE(p_error_code, 'UNKNOWN'), 100),
      "lastErrorMessage" = left(COALESCE(p_error_message, 'Background job failed.'), 1000),
      "updatedAt" = clock_timestamp()
  WHERE id = p_job_id;

  UPDATE public."BackgroundJobAttempt"
  SET status = 'failed', "errorCode" = left(COALESCE(p_error_code, 'UNKNOWN'), 100),
      "errorMessage" = left(COALESCE(p_error_message, 'Background job failed.'), 1000),
      "finishedAt" = clock_timestamp()
  WHERE "jobId" = p_job_id AND "attemptNumber" = current_attempt AND "workerId" = p_worker_id;
  RETURN next_status;
END;
$$;

REVOKE ALL ON FUNCTION app_private.claim_background_job(TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.heartbeat_background_job(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.complete_background_job(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.fail_background_job(TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.claim_background_job(TEXT, INTEGER) TO app_rw;
GRANT EXECUTE ON FUNCTION app_private.heartbeat_background_job(TEXT, TEXT, INTEGER) TO app_rw;
GRANT EXECUTE ON FUNCTION app_private.complete_background_job(TEXT, TEXT, JSONB) TO app_rw;
GRANT EXECUTE ON FUNCTION app_private.fail_background_job(TEXT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN) TO app_rw;
