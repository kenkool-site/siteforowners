-- Preflight reads rate-limit state without recording a request. Invitation
-- owner login calls this before its scrypt check, then records only failed
-- credentials through the existing atomic check_rate_limit function.
CREATE OR REPLACE FUNCTION is_rate_limit_available(
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

  RETURN current_count < p_max_requests;
END;
$$;
