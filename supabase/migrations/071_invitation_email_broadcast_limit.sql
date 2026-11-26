-- Guest broadcasts get their own email budget, separate from host RSVP
-- alert emails and guest confirmation emails.
--
-- email_notification_limit (default 250, and the app writes 250 on create)
-- counts emails to the host about RSVPs, guest confirmation emails, and any
-- other non-broadcast email. Those rows previously also counted guest
-- broadcasts (kind = 'celebrant_broadcast'), so a full host pool suppressed
-- the next guest email with allowed = false.
--
-- email_broadcast_limit counts only kind = 'celebrant_broadcast' email.
-- NULL means "use the platform default" passed by the app:
--   INVITATION_EMAIL_BROADCAST_LIMIT, otherwise 1000.
-- A founder sets a per-event override by saving a number on the event
-- (Site editor → RSVP settings → Guest email limit). Clearing the field
-- stores NULL and the platform default applies again.
-- Existing events stay NULL, so they can send as soon as this migration
-- runs: prior host alerts do not spend the new budget.
--
-- Run before deploying the app change. reserve_invitation_notification gains
-- p_platform_email_broadcast_limit; the previous 8-argument overload is
-- dropped so PostgREST does not see two functions. The same applies to
-- retry_invitation_notification.

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS email_broadcast_limit integer
  CHECK (email_broadcast_limit IS NULL OR (email_broadcast_limit > 0 AND email_broadcast_limit <= 1000000));

COMMENT ON COLUMN public.invitation_events.email_broadcast_limit IS
  'Guest-broadcast email cap. NULL uses INVITATION_EMAIL_BROADCAST_LIMIT or 1000. Does not include host RSVP alerts or guest confirmations.';

DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer);
DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid);

CREATE FUNCTION public.reserve_invitation_notification(
  p_event_id uuid,
  p_rsvp_id uuid,
  p_audience text,
  p_channel text,
  p_recipient text,
  p_kind text,
  p_broadcast_id uuid DEFAULT NULL,
  p_platform_sms_broadcast_limit integer DEFAULT NULL,
  p_platform_email_broadcast_limit integer DEFAULT NULL
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
  v_broadcast_sms boolean;
  v_broadcast_email boolean;
  v_platform integer;
  v_email_platform integer;
BEGIN
  IF p_audience NOT IN ('owner', 'guest')
    OR p_channel NOT IN ('email', 'sms')
    OR p_kind NOT IN ('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast')
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

  v_broadcast_sms := p_channel = 'sms' AND p_kind = 'celebrant_broadcast';
  v_broadcast_email := p_channel = 'email' AND p_kind = 'celebrant_broadcast';
  v_platform := CASE
    WHEN p_platform_sms_broadcast_limit IS NOT NULL
      AND p_platform_sms_broadcast_limit > 0
      AND p_platform_sms_broadcast_limit <= 1000000
    THEN p_platform_sms_broadcast_limit
    ELSE NULL
  END;
  v_email_platform := CASE
    WHEN p_platform_email_broadcast_limit IS NOT NULL
      AND p_platform_email_broadcast_limit > 0
      AND p_platform_email_broadcast_limit <= 1000000
    THEN p_platform_email_broadcast_limit
    ELSE NULL
  END;

  IF v_broadcast_sms THEN
    v_limit := COALESCE(v_event.sms_broadcast_limit, v_platform, 500);
  ELSIF v_broadcast_email THEN
    v_limit := COALESCE(v_event.email_broadcast_limit, v_email_platform, 1000);
  ELSIF p_channel = 'email' THEN
    v_limit := v_event.email_notification_limit;
  ELSE
    v_limit := v_event.sms_notification_limit;
  END IF;

  IF v_broadcast_sms THEN
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = p_event_id
      AND notification.channel = 'sms'
      AND notification.kind = 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed');
  ELSIF v_broadcast_email THEN
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = p_event_id
      AND notification.channel = 'email'
      AND notification.kind = 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed');
  ELSIF p_channel = 'sms' THEN
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = p_event_id
      AND notification.channel = 'sms'
      AND notification.kind <> 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed');
  ELSE
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = p_event_id
      AND notification.channel = 'email'
      AND notification.kind <> 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed');
  END IF;

  IF v_count >= v_limit THEN
    INSERT INTO public.invitation_notifications (
      event_id, rsvp_id, audience, channel, recipient, kind, status, broadcast_id
    ) VALUES (
      p_event_id, p_rsvp_id, p_audience, p_channel, p_recipient, p_kind, 'suppressed', p_broadcast_id
    )
    RETURNING id INTO v_id;

    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;

  INSERT INTO public.invitation_notifications (
    event_id, rsvp_id, audience, channel, recipient, kind, status, broadcast_id
  ) VALUES (
    p_event_id, p_rsvp_id, p_audience, p_channel, p_recipient, p_kind, 'pending', p_broadcast_id
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer, integer) TO service_role;

-- Retry must use the same split. A failed guest email is re-checked against
-- the broadcast budget; a failed host RSVP alert or guest confirmation is
-- re-checked against email_notification_limit and does not see broadcast
-- rows. The row being retried is excluded, matching the previous function.
DROP FUNCTION IF EXISTS public.retry_invitation_notification(uuid, integer);
DROP FUNCTION IF EXISTS public.retry_invitation_notification(uuid);

CREATE FUNCTION public.retry_invitation_notification(
  p_notification_id uuid,
  p_platform_sms_broadcast_limit integer DEFAULT NULL,
  p_platform_email_broadcast_limit integer DEFAULT NULL
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
  v_broadcast_sms boolean;
  v_broadcast_email boolean;
  v_platform integer;
  v_email_platform integer;
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

  v_broadcast_sms := v_notification.channel = 'sms' AND v_notification.kind = 'celebrant_broadcast';
  v_broadcast_email := v_notification.channel = 'email' AND v_notification.kind = 'celebrant_broadcast';
  v_platform := CASE
    WHEN p_platform_sms_broadcast_limit IS NOT NULL
      AND p_platform_sms_broadcast_limit > 0
      AND p_platform_sms_broadcast_limit <= 1000000
    THEN p_platform_sms_broadcast_limit
    ELSE NULL
  END;
  v_email_platform := CASE
    WHEN p_platform_email_broadcast_limit IS NOT NULL
      AND p_platform_email_broadcast_limit > 0
      AND p_platform_email_broadcast_limit <= 1000000
    THEN p_platform_email_broadcast_limit
    ELSE NULL
  END;

  IF v_broadcast_sms THEN
    v_limit := COALESCE(v_event.sms_broadcast_limit, v_platform, 500);
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = v_notification.event_id
      AND notification.channel = 'sms'
      AND notification.kind = 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed')
      AND notification.id <> p_notification_id;
  ELSIF v_broadcast_email THEN
    v_limit := COALESCE(v_event.email_broadcast_limit, v_email_platform, 1000);
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = v_notification.event_id
      AND notification.channel = 'email'
      AND notification.kind = 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed')
      AND notification.id <> p_notification_id;
  ELSIF v_notification.channel = 'sms' THEN
    v_limit := v_event.sms_notification_limit;
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = v_notification.event_id
      AND notification.channel = 'sms'
      AND notification.kind <> 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed')
      AND notification.id <> p_notification_id;
  ELSE
    v_limit := v_event.email_notification_limit;
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = v_notification.event_id
      AND notification.channel = 'email'
      AND notification.kind <> 'celebrant_broadcast'
      AND notification.status IN ('pending', 'sent', 'failed')
      AND notification.id <> p_notification_id;
  END IF;

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

REVOKE ALL ON FUNCTION public.retry_invitation_notification(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_invitation_notification(uuid, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_invitation_notification(uuid, integer, integer) TO service_role;
