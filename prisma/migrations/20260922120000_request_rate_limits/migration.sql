-- Durable, cross-instance request throttling for sensitive and expensive API
-- routes. The table lives outside exposed schemas and is reachable only
-- through the narrowly-scoped function granted to the application's DB role.

CREATE TABLE app_private.rate_limit_bucket (
  policy_key text NOT NULL,
  client_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (policy_key, client_hash, window_start),
  CONSTRAINT rate_limit_policy_key_length CHECK (length(policy_key) BETWEEN 1 AND 80),
  CONSTRAINT rate_limit_client_hash_length CHECK (length(client_hash) = 64),
  CONSTRAINT rate_limit_request_count_positive CHECK (request_count > 0)
);

REVOKE ALL ON TABLE app_private.rate_limit_bucket FROM PUBLIC;
REVOKE ALL ON TABLE app_private.rate_limit_bucket FROM anon, authenticated, app_rw;

CREATE FUNCTION app_private.check_rate_limit(
  p_policy_key text,
  p_client_hash text,
  p_window_seconds integer,
  p_request_limit integer
)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF length(p_policy_key) NOT BETWEEN 1 AND 80
     OR p_client_hash !~ '^[0-9a-f]{64}$'
     OR p_window_seconds NOT BETWEEN 1 AND 86400
     OR p_request_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO app_private.rate_limit_bucket AS bucket (
    policy_key, client_hash, window_start, request_count, updated_at
  ) VALUES (
    p_policy_key, p_client_hash, v_window_start, 1, v_now
  )
  ON CONFLICT (policy_key, client_hash, window_start)
  DO UPDATE SET
    request_count = bucket.request_count + 1,
    updated_at = v_now
  RETURNING request_count INTO v_count;

  -- Opportunistic bounded cleanup avoids a separate scheduler dependency.
  IF mod(abs(hashtext(p_client_hash)), 100) = 0 THEN
    DELETE FROM app_private.rate_limit_bucket
    WHERE window_start < v_now - interval '48 hours';
  END IF;

  RETURN QUERY SELECT
    v_count <= p_request_limit,
    greatest(p_request_limit - v_count, 0),
    greatest(ceil(extract(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer, 1);
END;
$$;

REVOKE ALL ON FUNCTION app_private.check_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.check_rate_limit(text, text, integer, integer) TO app_rw;
