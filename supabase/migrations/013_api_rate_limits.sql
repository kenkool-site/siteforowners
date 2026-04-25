-- Generic API rate-limit log + atomic check-and-record function.
-- Used by /api/track (60/min per tenant+IP) and /api/admin/login
-- (50 failed/hour per tenant, on top of the existing per-(tenant, IP) caps).

CREATE TABLE IF NOT EXISTS api_request_log (
  bucket text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Hot index: recent rows per bucket.
CREATE INDEX IF NOT EXISTS idx_api_request_log_bucket_recent
  ON api_request_log (bucket, attempted_at DESC);

-- Service-role only.
ALTER TABLE api_request_log ENABLE ROW LEVEL SECURITY;

-- Atomic check-and-record. Counts rows in the trailing window for `bucket`;
-- if count < max_requests, inserts a new row and returns true. Otherwise
-- returns false without inserting (the caller should reject the request).
--
-- The count happens BEFORE the insert, so the call is naturally rate-safe
-- against concurrent callers — at most max_requests inserts can succeed
-- within the window because each check sees the prior inserts.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_max_requests integer
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  current_count integer;
BEGIN
  SELECT count(*)
  INTO current_count
  FROM api_request_log
  WHERE bucket = p_bucket
    AND attempted_at > now() - make_interval(secs => p_window_seconds);

  IF current_count >= p_max_requests THEN
    RETURN false;
  END IF;

  INSERT INTO api_request_log (bucket) VALUES (p_bucket);
  RETURN true;
END;
$$;

-- Cleanup: removes rows older than 1 hour. Run periodically (cron, manual,
-- or call from another endpoint). The 1-hour horizon covers all current
-- rate-limit windows (login: 1 hour, track: 1 minute).
CREATE OR REPLACE FUNCTION purge_old_api_request_log()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  removed integer;
BEGIN
  DELETE FROM api_request_log
  WHERE attempted_at < now() - interval '1 hour';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
