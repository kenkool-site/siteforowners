-- One row per event and hashed network fingerprint. The primary key makes the
-- upsert serialize concurrent attempts for exactly this event/IP combination.
CREATE TABLE public.invitation_passcode_rate_limits (
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  PRIMARY KEY (event_id, ip_hash)
);

ALTER TABLE public.invitation_passcode_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_passcode_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.attempt_invitation_passcode_rate_limit(
  p_event_id uuid,
  p_ip_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_window_seconds <= 0 OR p_max_attempts <= 0 THEN
    RAISE EXCEPTION 'Passcode limiter requires positive window and attempt limits';
  END IF;

  INSERT INTO public.invitation_passcode_rate_limits AS current_limit (
    event_id,
    ip_hash,
    window_started_at,
    attempt_count
  )
  VALUES (p_event_id, p_ip_hash, pg_catalog.now(), 1)
  ON CONFLICT (event_id, ip_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN pg_catalog.now()
      ELSE current_limit.window_started_at
    END,
    attempt_count = CASE
      WHEN current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
        THEN 1
      ELSE current_limit.attempt_count + 1
    END
  WHERE current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
    OR current_limit.attempt_count < p_max_attempts
  RETURNING true INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.attempt_invitation_passcode_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attempt_invitation_passcode_rate_limit(uuid, text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attempt_invitation_passcode_rate_limit(uuid, text, integer, integer) TO service_role;
