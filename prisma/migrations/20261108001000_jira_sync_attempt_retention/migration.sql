-- Attempt history is immutable while its job is active. Revoking a Jira
-- connection or expiring a terminal job must also remove the child attempts;
-- otherwise the immutable trigger blocks the job's FK cascade and prevents
-- the source-data purge from completing.
CREATE OR REPLACE FUNCTION public.protect_jira_sync_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    NOT EXISTS (SELECT 1 FROM public."JiraSyncJob" j WHERE j.id = OLD."jobId")
    OR EXISTS (
      SELECT 1 FROM public."JiraSyncJob" j
      JOIN public."JiraConnection" c ON c.id = j."connectionId"
      WHERE j.id = OLD."jobId" AND (
        c.status = 'revoked'
        OR (j."updatedAt" < now() - interval '90 days'
          AND j.status IN ('completed', 'failed', 'cancelled'))
      )
    )
  ) THEN RETURN OLD; END IF;

  RAISE EXCEPTION 'Jira sync attempt history is immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.protect_jira_sync_attempt() FROM PUBLIC;
DROP TRIGGER jira_sync_attempt_immutable ON public."JiraSyncAttempt";
CREATE TRIGGER jira_sync_attempt_immutable
  BEFORE UPDATE OR DELETE ON public."JiraSyncAttempt"
  FOR EACH ROW EXECUTE FUNCTION public.protect_jira_sync_attempt();
