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
  v_explicit_update boolean := p_existing_rsvp_id IS NOT NULL;
  v_is_update boolean := p_existing_rsvp_id IS NOT NULL;
  v_email text := NULLIF(lower(pg_catalog.btrim(p_email)), '');
  v_phone text := NULLIF(pg_catalog.regexp_replace(pg_catalog.btrim(p_phone), '[^0-9+]', '', 'g'), '');
  v_contact_ids uuid[];
  v_submission_count integer;
  v_attending_total integer;
  v_declined_total integer;
  v_new_rsvp_id uuid;
  v_mutation_kind text;
  v_names text[] := CASE WHEN p_attending THEN coalesce(p_additional_guest_names, '{}') ELSE '{}' END;
  v_notes text := NULLIF(pg_catalog.btrim(p_dietary_or_accessibility_notes), '');
  v_message text := NULLIF(pg_catalog.btrim(p_message), '');
BEGIN
  SELECT event.*
  INTO v_event
  FROM public.invitation_events AS event
  INNER JOIN public.invitation_owners AS owner ON owner.id = event.owner_id
  WHERE event.id = p_event_id
    AND (p_administrative OR owner.is_active = true)
  FOR UPDATE OF event;

  IF NOT FOUND
    OR (NOT p_administrative AND (
      v_event.status IN ('draft', 'expired', 'offline')
      OR (v_event.expire_at IS NOT NULL AND v_event.expire_at <= pg_catalog.now())
    ))
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  IF p_administrative AND NOT v_explicit_update THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_INVALID_EDIT_TOKEN';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_primary_name), '') IS NULL
    OR (NOT p_administrative AND NULLIF(pg_catalog.btrim(p_edit_token_hash), '') IS NULL)
    OR (v_email IS NULL AND v_phone IS NULL)
    OR p_attending IS NULL
    OR (p_attending AND (p_party_size IS NULL OR p_party_size < 1))
    OR (NOT p_attending AND p_party_size <> 0)
    OR coalesce(pg_catalog.array_length(p_additional_guest_names, 1), 0) > greatest(p_party_size - 1, 0)
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  IF v_explicit_update THEN
    SELECT rsvp.* INTO v_existing
    FROM public.invitation_rsvps AS rsvp
    WHERE rsvp.id = p_existing_rsvp_id AND rsvp.event_id = p_event_id;

    IF NOT FOUND OR (NOT p_administrative AND v_existing.edit_token_hash <> p_edit_token_hash) THEN
      RAISE EXCEPTION USING MESSAGE = 'INVITE_INVALID_EDIT_TOKEN';
    END IF;
  ELSE
    SELECT pg_catalog.array_agg(DISTINCT rsvp.id)
    INTO v_contact_ids
    FROM public.invitation_rsvps AS rsvp
    WHERE rsvp.event_id = p_event_id
      AND (
        (v_email IS NOT NULL AND lower(pg_catalog.btrim(rsvp.email)) = v_email)
        OR (v_phone IS NOT NULL AND NULLIF(pg_catalog.regexp_replace(pg_catalog.btrim(rsvp.phone), '[^0-9+]', '', 'g'), '') = v_phone)
      );

    IF coalesce(pg_catalog.cardinality(v_contact_ids), 0) > 1 THEN
      RAISE EXCEPTION USING MESSAGE = 'INVITE_CONTACT_CONFLICT';
    END IF;

    IF coalesce(pg_catalog.cardinality(v_contact_ids), 0) = 1 THEN
      SELECT rsvp.* INTO v_existing
      FROM public.invitation_rsvps AS rsvp
      WHERE rsvp.id = v_contact_ids[1] AND rsvp.event_id = p_event_id;
      v_is_update := true;
    END IF;
  END IF;

  -- Contact-only retries and updates follow the same availability window as new RSVPs.
  -- Previously issued, token-authenticated links and administrative edits retain their
  -- restorative closed-event behavior.
  IF NOT p_administrative AND NOT v_explicit_update AND (
    v_event.status = 'rsvp_closed'
    OR (v_event.rsvp_deadline IS NOT NULL AND v_event.rsvp_deadline <= pg_catalog.now())
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_RSVP_CLOSED';
  END IF;

  IF NOT v_is_update THEN
    SELECT pg_catalog.count(*)::integer INTO v_submission_count
    FROM public.invitation_rsvps WHERE event_id = p_event_id;
    IF v_submission_count >= v_event.submission_limit THEN
      RAISE EXCEPTION USING MESSAGE = 'INVITE_SUBMISSION_LIMIT_REACHED';
    END IF;
  END IF;

  SELECT coalesce(pg_catalog.sum(rsvp.party_size) FILTER (WHERE rsvp.attending), 0)::integer
  INTO v_attending_total
  FROM public.invitation_rsvps AS rsvp
  WHERE rsvp.event_id = p_event_id
    AND (NOT v_is_update OR rsvp.id <> v_existing.id);

  IF p_attending
    AND v_event.capacity IS NOT NULL
    AND (
      NOT v_is_update
      OR p_party_size > CASE WHEN v_existing.attending THEN v_existing.party_size ELSE 0 END
    )
    AND v_attending_total + p_party_size > v_event.capacity
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_CAPACITY_REACHED';
  END IF;

  IF v_is_update AND
    pg_catalog.btrim(v_existing.primary_name) = pg_catalog.btrim(p_primary_name)
    AND NULLIF(lower(pg_catalog.btrim(v_existing.email)), '') IS NOT DISTINCT FROM v_email
    AND NULLIF(pg_catalog.regexp_replace(pg_catalog.btrim(v_existing.phone), '[^0-9+]', '', 'g'), '') IS NOT DISTINCT FROM v_phone
    AND v_existing.attending = p_attending
    AND (v_existing.party_size = CASE WHEN p_attending THEN p_party_size ELSE 0 END)
    AND coalesce(v_existing.additional_guest_names, '{}') = v_names
    AND NULLIF(pg_catalog.btrim(v_existing.dietary_or_accessibility_notes), '') IS NOT DISTINCT FROM v_notes
    AND NULLIF(pg_catalog.btrim(v_existing.message), '') IS NOT DISTINCT FROM v_message
  THEN
    v_new_rsvp_id := v_existing.id;
    v_mutation_kind := 'unchanged';
  ELSIF v_is_update THEN
    UPDATE public.invitation_rsvps
    SET primary_name = pg_catalog.btrim(p_primary_name),
        email = v_email,
        phone = v_phone,
        attending = p_attending,
        party_size = CASE WHEN p_attending THEN p_party_size ELSE 0 END,
        additional_guest_names = v_names,
        dietary_or_accessibility_notes = v_notes,
        message = v_message,
        updated_at = pg_catalog.now()
    WHERE id = v_existing.id AND event_id = p_event_id
    RETURNING id INTO v_new_rsvp_id;
    v_mutation_kind := 'updated';
  ELSE
    INSERT INTO public.invitation_rsvps (
      event_id, primary_name, email, phone, attending, party_size,
      additional_guest_names, dietary_or_accessibility_notes, message, edit_token_hash
    ) VALUES (
      p_event_id, pg_catalog.btrim(p_primary_name), v_email, v_phone, p_attending,
      CASE WHEN p_attending THEN p_party_size ELSE 0 END, v_names, v_notes, v_message, p_edit_token_hash
    ) RETURNING id INTO v_new_rsvp_id;
    v_mutation_kind := 'created';
  END IF;

  SELECT
    coalesce(pg_catalog.sum(rsvp.party_size) FILTER (WHERE rsvp.attending), 0)::integer,
    pg_catalog.count(*) FILTER (WHERE NOT rsvp.attending)::integer
  INTO v_attending_total, v_declined_total
  FROM public.invitation_rsvps AS rsvp
  WHERE rsvp.event_id = p_event_id;

  RETURN QUERY SELECT v_new_rsvp_id, v_mutation_kind, v_attending_total,
    v_declined_total,
    CASE WHEN v_event.capacity IS NULL THEN NULL ELSE v_event.capacity - v_attending_total END;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_invitation_rsvp(uuid, text, text, text, boolean, integer, text[], text, text, text, uuid, boolean) TO service_role;
