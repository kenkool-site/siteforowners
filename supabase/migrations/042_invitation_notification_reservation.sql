-- Atomic capacity reservation for invitation_notifications, following the
-- same shape as 040_submit_invitation_rsvp.sql's capacity guard: lock the
-- parent invitation_events row FOR UPDATE (it is already the natural lock
-- target for this event, same as the RSVP capacity check), count existing
-- non-suppressed attempts for the event+channel, and either insert a
-- 'pending' row (reservation succeeded) or a 'suppressed' row (limit
-- reached) in the same transaction so concurrent RSVPs cannot overrun the
-- founder-configured email/SMS caps.
--
-- Suppressed rows do not themselves consume further capacity: the count
-- below only sums 'pending' + 'sent' + 'failed' rows, so a suppression can
-- never cascade into more suppressions once the limit is reached once.
CREATE OR REPLACE FUNCTION public.reserve_invitation_notification(
  p_event_id uuid,
  p_rsvp_id uuid,
  p_audience text,
  p_channel text,
  p_recipient text,
  p_kind text
)
RETURNS TABLE (
  notification_id uuid,
  allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event public.invitation_events%ROWTYPE;
  v_limit integer;
  v_count integer;
  v_id uuid;
BEGIN
  IF p_audience NOT IN ('owner', 'guest')
    OR p_channel NOT IN ('email', 'sms')
    OR p_kind NOT IN ('rsvp_created', 'rsvp_updated', 'guest_confirmation')
    OR NULLIF(pg_catalog.btrim(p_recipient), '') IS NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_NOTIFICATION_INVALID_INPUT';
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.invitation_events AS event
  WHERE event.id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'INVITE_EVENT_UNAVAILABLE';
  END IF;

  v_limit := CASE
    WHEN p_channel = 'email' THEN v_event.email_notification_limit
    ELSE v_event.sms_notification_limit
  END;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.invitation_notifications AS notification
  WHERE notification.event_id = p_event_id
    AND notification.channel = p_channel
    AND notification.status IN ('pending', 'sent', 'failed');

  IF v_count >= v_limit THEN
    INSERT INTO public.invitation_notifications (
      event_id, rsvp_id, audience, channel, recipient, kind, status
    ) VALUES (
      p_event_id, p_rsvp_id, p_audience, p_channel, p_recipient, p_kind, 'suppressed'
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;

  INSERT INTO public.invitation_notifications (
    event_id, rsvp_id, audience, channel, recipient, kind, status
  ) VALUES (
    p_event_id, p_rsvp_id, p_audience, p_channel, p_recipient, p_kind, 'pending'
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, true;
END;
$$;

-- Founder-initiated retry of a single failed notification. Reuses the same
-- row/id (and therefore the same provider idempotency key) instead of
-- reserving a new one, since the failed attempt already counted toward the
-- event+channel limit above. Re-checks the *current* limit (excluding this
-- row) before flipping it back to 'pending' so a founder cannot use retry
-- to bypass a cap that has since been reached by other traffic; on a
-- reached limit the row is left untouched (still 'failed') rather than
-- silently reclassified as 'suppressed', since the founder explicitly
-- asked for a retry rather than a fresh suppressed attempt.
CREATE OR REPLACE FUNCTION public.retry_invitation_notification(
  p_notification_id uuid
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  event_id uuid,
  event_title text,
  event_slug text,
  rsvp_id uuid,
  audience text,
  channel text,
  recipient text,
  kind text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_notification public.invitation_notifications%ROWTYPE;
  v_event public.invitation_events%ROWTYPE;
  v_limit integer;
  v_count integer;
BEGIN
  SELECT notification.*
  INTO v_notification
  FROM public.invitation_notifications AS notification
  WHERE notification.id = p_notification_id
  FOR UPDATE;

  IF NOT FOUND OR v_notification.status <> 'failed' THEN
    RETURN QUERY SELECT
      false, 'not_found',
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT event.*
  INTO v_event
  FROM public.invitation_events AS event
  WHERE event.id = v_notification.event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false, 'not_found',
      NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  v_limit := CASE
    WHEN v_notification.channel = 'email' THEN v_event.email_notification_limit
    ELSE v_event.sms_notification_limit
  END;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.invitation_notifications AS notification
  WHERE notification.event_id = v_notification.event_id
    AND notification.channel = v_notification.channel
    AND notification.status IN ('pending', 'sent', 'failed')
    AND notification.id <> p_notification_id;

  IF v_count >= v_limit THEN
    RETURN QUERY SELECT
      false, 'limit_reached',
      v_event.id, v_event.title, v_event.slug, v_notification.rsvp_id,
      v_notification.audience, v_notification.channel, v_notification.recipient, v_notification.kind;
    RETURN;
  END IF;

  UPDATE public.invitation_notifications AS notification
  SET status = 'pending', failure_reason = NULL, updated_at = pg_catalog.now()
  WHERE notification.id = p_notification_id;

  RETURN QUERY SELECT
    true, NULL::text,
    v_event.id, v_event.title, v_event.slug, v_notification.rsvp_id,
    v_notification.audience, v_notification.channel, v_notification.recipient, v_notification.kind;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.retry_invitation_notification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_invitation_notification(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_invitation_notification(uuid) TO service_role;

-- Concurrency smoke: reservation cap
-- 1. Seed a published event with email_notification_limit = 1 and copy its UUID below.
-- 2. Seed one attending RSVP on that event and copy its UUID below.
-- 3. In two shells at the same time, run this command (same event/RSVP, distinct recipients):
--    psql "$DATABASE_URL" -c "select * from public.reserve_invitation_notification('<event-id>','<rsvp-id>','owner','email','owner@example.com','rsvp_created');"
-- 4. Exactly one call returns allowed = true; the other returns allowed = false with a 'suppressed' row.
-- 5. Verify: select status, count(*) from public.invitation_notifications where event_id = '<event-id>' group by status; -- one 'pending' (or 'sent'/'failed' once app-layer runs), one 'suppressed'
--
-- Concurrency smoke: retry respects a lowered limit
-- 1. Seed two 'failed' email notifications on an event whose email_notification_limit is later lowered to 1.
-- 2. Call retry_invitation_notification for each id.
-- 3. At most one returns allowed = true (the other returns allowed = false, reason = 'limit_reached') because the
--    count excludes only the row being retried, so the still-'failed' sibling row keeps counting against the cap.
