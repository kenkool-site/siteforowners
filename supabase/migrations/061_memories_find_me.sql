ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS find_me_enabled boolean NOT NULL DEFAULT false;

-- Nullable (not NOT NULL DEFAULT false): has_faces is only ever computed as
-- a side effect of the moderation pipeline running (see moderate-media.ts),
-- which happens once, at upload. Every photo already in a gallery before
-- this feature ships will never get that side effect retroactively, so a
-- future incremental backfill needs to tell "checked, no face found" (false)
-- apart from "never checked" (null) — a NOT NULL default would collapse both
-- into false and make that backfill impossible to target correctly.
ALTER TABLE public.memory_media
  ADD COLUMN IF NOT EXISTS has_faces boolean;

-- One row per event and guest session — the primary key makes the upsert
-- serialize concurrent Find Me attempts for exactly this event/guest
-- combination, mirroring invitation_passcode_rate_limits' own shape
-- (migration 041) for the same reason: an atomic check-and-increment, not a
-- read-then-write race. guest_session_id is a uuid (it's the sessionId field
-- already minted by /api/memories/events/[eventId]/session, always a
-- randomUUID()), not a hash, so no format CHECK is needed the way ip_hash's
-- text column needed one.
CREATE TABLE public.memory_find_me_rate_limits (
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  guest_session_id uuid NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  PRIMARY KEY (event_id, guest_session_id)
);

ALTER TABLE public.memory_find_me_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memory_find_me_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.attempt_memories_find_me_rate_limit(
  p_event_id uuid,
  p_guest_session_id uuid,
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
    RAISE EXCEPTION 'Find Me limiter requires positive window and attempt limits';
  END IF;

  INSERT INTO public.memory_find_me_rate_limits AS current_limit (
    event_id,
    guest_session_id,
    window_started_at,
    attempt_count
  )
  VALUES (p_event_id, p_guest_session_id, pg_catalog.now(), 1)
  ON CONFLICT (event_id, guest_session_id) DO UPDATE
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

REVOKE ALL ON FUNCTION public.attempt_memories_find_me_rate_limit(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attempt_memories_find_me_rate_limit(uuid, uuid, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attempt_memories_find_me_rate_limit(uuid, uuid, integer, integer) TO service_role;
