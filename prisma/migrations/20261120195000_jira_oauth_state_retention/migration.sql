-- The OAuth state is immutable while it can be used, but expired states must
-- be removed by the scheduled Jira source-retention function after seven days.
-- The original trigger returned NEW on DELETE, suppressing unconsumed cleanup
-- and rejecting consumed cleanup.
CREATE OR REPLACE FUNCTION public.protect_consumed_jira_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."expiresAt" < now() - interval '7 days' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'OAuth state cannot be deleted before retention expiry' USING ERRCODE = '23514';
  END IF;

  IF OLD."consumedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Consumed OAuth state is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
