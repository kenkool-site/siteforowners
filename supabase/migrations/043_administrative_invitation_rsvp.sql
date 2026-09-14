-- Replace the public-only RSVP RPC with the same event-locked mutation plus
-- an explicit administrative credential mode. Application routes must still
-- authorize an owner/founder before setting p_administrative; the database
-- mode only replaces the guest edit-token check and never permits creation.
DROP FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid);

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
  p_existing_rsvp_id uuid DEFAULT NULL,
  p_administrative boolean DEFAULT false
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
    AND (p_administrative OR owner.is_active = true)
  FOR UPDATE OF event;

  IF NOT FOUND
    OR (
      NOT p_administrative
      AND (
        v_event.status IN ('draft', 'expired', 'offline')
        OR (v_event.expire_at IS NOT NULL AND v_event.expire_at <= pg_catalog.now())
      )
    )
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  IF p_administrative AND NOT v_is_update THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_INVALID_EDIT_TOKEN';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_primary_name), '') IS NULL
    OR (NOT p_administrative AND NULLIF(pg_catalog.btrim(p_edit_token_hash), '') IS NULL)
    OR (NULLIF(pg_catalog.btrim(p_email), '') IS NULL AND NULLIF(pg_catalog.btrim(p_phone), '') IS NULL)
    OR p_attending IS NULL
    OR (p_attending AND (p_party_size IS NULL OR p_party_size < 1))
    OR (NOT p_attending AND p_party_size <> 0)
    OR pg_catalog.coalesce(pg_catalog.array_length(p_additional_guest_names, 1), 0) > pg_catalog.greatest(p_party_size - 1, 0)
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  IF v_is_update THEN
    SELECT rsvp.*
    INTO v_existing
    FROM public.invitation_rsvps AS rsvp
    WHERE rsvp.id = p_existing_rsvp_id
      AND rsvp.event_id = p_event_id;

    IF NOT FOUND OR (NOT p_administrative AND v_existing.edit_token_hash <> p_edit_token_hash) THEN
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

  SELECT pg_catalog.coalesce(pg_catalog.sum(party_size) FILTER (WHERE attending), 0)::integer
  INTO v_attending_total
  FROM public.invitation_rsvps
  WHERE event_id = p_event_id
    AND (p_existing_rsvp_id IS NULL OR id <> p_existing_rsvp_id);

  IF p_attending
    AND v_event.capacity IS NOT NULL
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
      additional_guest_names = CASE WHEN p_attending THEN pg_catalog.coalesce(p_additional_guest_names, '{}') ELSE '{}' END,
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
      CASE WHEN p_attending THEN pg_catalog.coalesce(p_additional_guest_names, '{}') ELSE '{}' END,
      NULLIF(pg_catalog.btrim(p_dietary_or_accessibility_notes), ''),
      NULLIF(pg_catalog.btrim(p_message), ''),
      p_edit_token_hash
    )
    RETURNING id INTO v_new_rsvp_id;
  END IF;

  SELECT
    pg_catalog.coalesce(pg_catalog.sum(party_size) FILTER (WHERE attending), 0)::integer,
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

REVOKE ALL ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid, boolean) TO service_role;

-- Administrative concurrency smoke:
-- 1. Seed two one-person RSVPs in an event with capacity three.
-- 2. In two shells, call the new RPC for each RSVP with party size two,
--    p_existing_rsvp_id set, an empty token hash, and p_administrative=true.
-- 3. Exactly one update succeeds; the other returns INVITE_CAPACITY_REACHED.
