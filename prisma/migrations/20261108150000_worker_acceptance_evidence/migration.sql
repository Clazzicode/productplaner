-- Keep sanitized execution history so 24-hour observation is evidence, not a latest-row inference.
ALTER TABLE app_private."WorkerHealth" ADD COLUMN "lastTerminalJobFailureAt" timestamptz;
ALTER TABLE app_private."WorkerHealth" ADD COLUMN "terminalJobFailures" bigint NOT NULL DEFAULT 0 CHECK ("terminalJobFailures">=0);
ALTER TABLE app_private."WorkerHealth" ALTER COLUMN processed DROP NOT NULL, ALTER COLUMN completed DROP NOT NULL,
  ALTER COLUMN retried DROP NOT NULL, ALTER COLUMN failed DROP NOT NULL;
CREATE TABLE app_private."WorkerExecution" (
  "runId" text PRIMARY KEY, worker text NOT NULL CHECK (worker IN ('jira','background')),
  "startedAt" timestamptz NOT NULL, "finishedAt" timestamptz, outcome text CHECK (outcome IN ('succeeded','failed')),
  "releaseCommit" text CHECK ("releaseCommit" IS NULL OR "releaseCommit" ~ '^[a-f0-9]{40,64}$'),
  "durationMs" integer, processed integer, completed integer, retried integer, failed integer,
  stage text NOT NULL, "errorCode" text,
  CHECK (processed IS NULL OR processed>=0), CHECK (completed IS NULL OR completed>=0),
  CHECK (retried IS NULL OR retried>=0), CHECK (failed IS NULL OR failed>=0)
);
CREATE INDEX worker_execution_window ON app_private."WorkerExecution" ("releaseCommit",worker,"startedAt");
ALTER TABLE app_private."WorkerExecution" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private."WorkerExecution" FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON app_private."WorkerExecution" TO app_rw;
CREATE POLICY worker_execution_service ON app_private."WorkerExecution" FOR ALL TO app_rw
  USING (auth.uid() IS NULL) WITH CHECK (auth.uid() IS NULL);
CREATE FUNCTION app_private.protect_worker_execution() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."startedAt" < now()-interval '30 days' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Worker evidence is retained for 30 days';
  END IF;
  IF OLD.outcome IS NOT NULL OR NEW."runId"<>OLD."runId" OR NEW.worker<>OLD.worker OR NEW."startedAt"<>OLD."startedAt" OR NEW."releaseCommit" IS DISTINCT FROM OLD."releaseCommit" THEN
    RAISE EXCEPTION 'Completed worker evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.protect_worker_execution() FROM PUBLIC;
CREATE TRIGGER worker_execution_immutable BEFORE UPDATE OR DELETE ON app_private."WorkerExecution"
  FOR EACH ROW EXECUTE FUNCTION app_private.protect_worker_execution();
CREATE FUNCTION app_private.expire_worker_execution() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Service execution required' USING ERRCODE='42501'; END IF;
  DELETE FROM app_private."WorkerExecution" WHERE "startedAt"<now()-interval '30 days';
END $$;
REVOKE ALL ON FUNCTION app_private.expire_worker_execution() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.expire_worker_execution() TO app_rw;
