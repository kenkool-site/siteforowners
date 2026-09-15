-- Serialized public RSVP attempt limiter. A single event/fingerprint row is
-- atomically inserted or updated, so concurrent requests cannot overrun the cap.
CREATE TABLE public.invitation_rsvp_rate_limits (
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  PRIMARY KEY (event_id, ip_hash)
);

ALTER TABLE public.invitation_rsvp_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_rsvp_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.attempt_invitation_rsvp_rate_limit(
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
    RAISE EXCEPTION 'RSVP limiter requires positive window and attempt limits';
  END IF;

  INSERT INTO public.invitation_rsvp_rate_limits AS current_limit (
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

CREATE OR REPLACE FUNCTION public.submit_invitation_rsvp(
  p_event_id uuid,
  p_primary_name text,
  p_email text,
  p_phone text,
  p_attending boolean,
  p_party_size integer,
  p_additional_guest_names text[],
  p_dietary_or_accessibility_notes text,
  p_message text,
  p_edit_token_hash text,
  p_existing_rsvp_id uuid DEFAULT NULL
)
RETURNS TABLE (
  rsvp_id uuid,
  mutation_kind text,
  attending_total integer,
  declined_party_total integer,
  remaining_capacity integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.invitation_events%ROWTYPE;
  v_existing public.invitation_rsvps%ROWTYPE;
  v_is_update boolean := p_existing_rsvp_id IS NOT NULL;
  v_submission_count integer;
  v_attending_total integer;
  v_declined_total integer;
  v_new_rsvp_id uuid;
BEGIN
  SELECT event.*
  INTO v_event
  FROM public.invitation_events AS event
  INNER JOIN public.invitation_owners AS owner ON owner.id = event.owner_id
  WHERE event.id = p_event_id
    AND owner.is_active = true
  FOR UPDATE OF event;

  IF NOT FOUND
    OR v_event.status IN ('draft', 'expired', 'offline')
    OR (v_event.expire_at IS NOT NULL AND v_event.expire_at <= pg_catalog.now())
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_primary_name), '') IS NULL
    OR NULLIF(pg_catalog.btrim(p_edit_token_hash), '') IS NULL
    OR (NULLIF(pg_catalog.btrim(p_email), '') IS NULL AND NULLIF(pg_catalog.btrim(p_phone), '') IS NULL)
    OR p_attending IS NULL
    OR (p_attending AND (p_party_size IS NULL OR p_party_size < 1))
    OR (NOT p_attending AND p_party_size <> 0)
    OR coalesce(pg_catalog.array_length(p_additional_guest_names, 1), 0) > greatest(p_party_size - 1, 0)
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  IF v_is_update THEN
    SELECT rsvp.*
    INTO v_existing
    FROM public.invitation_rsvps AS rsvp
    WHERE rsvp.id = p_existing_rsvp_id
      AND rsvp.event_id = p_event_id;

    IF NOT FOUND OR v_existing.edit_token_hash <> p_edit_token_hash THEN
      RAISE EXCEPTION USING MESSAGE = 'INVITE_INVALID_EDIT_TOKEN';
    END IF;
  END IF;

  IF NOT v_is_update AND (
    v_event.status = 'rsvp_closed'
    OR (v_event.rsvp_deadline IS NOT NULL AND v_event.rsvp_deadline <= pg_catalog.now())
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_RSVP_CLOSED';
  END IF;

  IF NOT v_is_update THEN
    SELECT pg_catalog.count(*)::integer
    INTO v_submission_count
    FROM public.invitation_rsvps
    WHERE event_id = p_event_id;

    IF v_submission_count >= v_event.submission_limit THEN
      RAISE EXCEPTION USING MESSAGE = 'INVITE_SUBMISSION_LIMIT_REACHED';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.invitation_rsvps
      WHERE event_id = p_event_id
        AND (
          (p_email IS NOT NULL AND email = p_email)
          OR (p_phone IS NOT NULL AND phone = p_phone)
        )
    ) THEN
      RAISE EXCEPTION USING MESSAGE = 'INVITE_DUPLICATE_CONTACT';
    END IF;
  END IF;

  SELECT coalesce(pg_catalog.sum(party_size) FILTER (WHERE attending), 0)::integer
  INTO v_attending_total
  FROM public.invitation_rsvps
  WHERE event_id = p_event_id
    AND (p_existing_rsvp_id IS NULL OR id <> p_existing_rsvp_id);

  IF p_attending
    AND v_event.capacity IS NOT NULL
    AND (NOT v_is_update OR p_party_size > CASE WHEN v_existing.attending THEN v_existing.party_size ELSE 0 END)
    AND v_attending_total + p_party_size > v_event.capacity
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_CAPACITY_REACHED';
  END IF;

  IF v_is_update THEN
    UPDATE public.invitation_rsvps
    SET
      primary_name = pg_catalog.btrim(p_primary_name),
      email = NULLIF(pg_catalog.btrim(p_email), ''),
      phone = NULLIF(pg_catalog.btrim(p_phone), ''),
      attending = p_attending,
      party_size = CASE WHEN p_attending THEN p_party_size ELSE 0 END,
      additional_guest_names = CASE WHEN p_attending THEN coalesce(p_additional_guest_names, '{}') ELSE '{}' END,
      dietary_or_accessibility_notes = NULLIF(pg_catalog.btrim(p_dietary_or_accessibility_notes), ''),
      message = NULLIF(pg_catalog.btrim(p_message), ''),
      updated_at = pg_catalog.now()
    WHERE id = p_existing_rsvp_id
      AND event_id = p_event_id
    RETURNING id INTO v_new_rsvp_id;
  ELSE
    INSERT INTO public.invitation_rsvps (
      event_id,
      primary_name,
      email,
      phone,
      attending,
      party_size,
      additional_guest_names,
      dietary_or_accessibility_notes,
      message,
      edit_token_hash
    ) VALUES (
      p_event_id,
      pg_catalog.btrim(p_primary_name),
      NULLIF(pg_catalog.btrim(p_email), ''),
      NULLIF(pg_catalog.btrim(p_phone), ''),
      p_attending,
      CASE WHEN p_attending THEN p_party_size ELSE 0 END,
      CASE WHEN p_attending THEN coalesce(p_additional_guest_names, '{}') ELSE '{}' END,
      NULLIF(pg_catalog.btrim(p_dietary_or_accessibility_notes), ''),
      NULLIF(pg_catalog.btrim(p_message), ''),
      p_edit_token_hash
    )
    RETURNING id INTO v_new_rsvp_id;
  END IF;

  SELECT
    coalesce(pg_catalog.sum(party_size) FILTER (WHERE attending), 0)::integer,
    pg_catalog.count(*) FILTER (WHERE NOT attending)::integer
  INTO v_attending_total, v_declined_total
  FROM public.invitation_rsvps
  WHERE event_id = p_event_id;

  RETURN QUERY SELECT
    v_new_rsvp_id,
    CASE WHEN v_is_update THEN 'updated' ELSE 'created' END,
    v_attending_total,
    v_declined_total,
    CASE WHEN v_event.capacity IS NULL THEN NULL ELSE v_event.capacity - v_attending_total END;
END;
$$;

REVOKE ALL ON FUNCTION public.attempt_invitation_rsvp_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attempt_invitation_rsvp_rate_limit(uuid, text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attempt_invitation_rsvp_rate_limit(uuid, text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid) TO service_role;

-- Concurrency smoke: final seat
-- 1. Seed a published event whose capacity is one and copy its UUID below.
-- 2. In two shells at the same time, run this command with different contact/token values:
--    psql "$DATABASE_URL" -c "select * from public.submit_invitation_rsvp('<event-id>','Guest A','a@example.com',null,true,1,'{}',null,null,'<64-char-hash>',null);"
-- 3. Exactly one call returns a row; the other returns INVITE_CAPACITY_REACHED.
-- 4. Verify: select coalesce(sum(party_size) filter (where attending),0) from public.invitation_rsvps where event_id = '<event-id>'; -- must be 1
--
-- Concurrency smoke: simultaneous party increases
-- 1. Seed two attending, one-person RSVPs in an event with capacity three.
-- 2. In two shells, call submit_invitation_rsvp for each RSVP ID/token hash with party size 2.
-- 3. Exactly one update succeeds and the other returns INVITE_CAPACITY_REACHED; total attending must be 3.
