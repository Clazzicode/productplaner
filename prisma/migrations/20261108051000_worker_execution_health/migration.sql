CREATE TABLE app_private."WorkerHealth" (
  "worker" text PRIMARY KEY CHECK ("worker" IN ('jira', 'background')),
  "runId" text NOT NULL,
  "startedAt" timestamptz NOT NULL,
  "finishedAt" timestamptz,
  "lastSuccessAt" timestamptz,
  "lastOutcome" text CHECK ("lastOutcome" IN ('succeeded','failed')),
  "consecutiveFailures" integer NOT NULL DEFAULT 0 CHECK ("consecutiveFailures" >= 0),
  "durationMs" integer,
  "processed" integer NOT NULL DEFAULT 0 CHECK ("processed" >= 0),
  "completed" integer NOT NULL DEFAULT 0 CHECK ("completed" >= 0),
  "retried" integer NOT NULL DEFAULT 0 CHECK ("retried" >= 0),
  "failed" integer NOT NULL DEFAULT 0 CHECK ("failed" >= 0),
  "errorCode" text,
  "stage" text NOT NULL
);
ALTER TABLE app_private."WorkerHealth" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private."WorkerHealth" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON app_private."WorkerHealth" TO app_rw;
-- Only trusted service-context operations using the non-bypassing app role
-- may access operational health. Authenticated user claims cannot write it.
CREATE POLICY worker_health_service ON app_private."WorkerHealth" FOR ALL TO app_rw
  USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
