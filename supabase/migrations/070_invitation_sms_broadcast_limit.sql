-- Guest broadcasts get their own SMS budget, separate from host RSVP alert texts.
--
-- sms_notification_limit (default 100 in the database; the app still writes 50 on
-- create) counts texts to the host about RSVPs and any non-broadcast SMS.
-- sms_broadcast_limit counts only kind = 'celebrant_broadcast' SMS.
-- NULL means "use the platform default" passed by the app:
--   INVITATION_SMS_BROADCAST_LIMIT, otherwise 500.
-- A founder sets a per-event override by saving a number on the event
-- (Site editor → RSVP settings → Guest text limit). Clearing the field
-- stores NULL and the platform default applies again.
--
-- Run before deploying the app change. reserve_invitation_notification gains
-- p_platform_sms_broadcast_limit; the previous 7-argument overload is dropped
-- so PostgREST does not see two functions.

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS sms_broadcast_limit integer
  CHECK (sms_broadcast_limit IS NULL OR (sms_broadcast_limit > 0 AND sms_broadcast_limit <= 1000000));

COMMENT ON COLUMN public.invitation_events.sms_broadcast_limit IS
  'Guest-broadcast SMS cap. NULL uses INVITATION_SMS_BROADCAST_LIMIT or 500. Does not include host RSVP alert texts.';

DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid);

CREATE FUNCTION public.reserve_invitation_notification(
  p_event_id uuid,
  p_rsvp_id uuid,
  p_audience text,
  p_channel text,
  p_recipient text,
  p_kind text,
  p_broadcast_id uuid DEFAULT NULL,
  p_platform_sms_broadcast_limit integer DEFAULT NULL
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
  v_platform integer;
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
  v_platform := CASE
    WHEN p_platform_sms_broadcast_limit IS NOT NULL
      AND p_platform_sms_broadcast_limit > 0
      AND p_platform_sms_broadcast_limit <= 1000000
    THEN p_platform_sms_broadcast_limit
    ELSE NULL
  END;

  IF v_broadcast_sms THEN
    v_limit := COALESCE(v_event.sms_broadcast_limit, v_platform, 500);
  ELSE
    v_limit := CASE
      WHEN p_channel = 'email' THEN v_event.email_notification_limit
      ELSE v_event.sms_notification_limit
    END;
  END IF;

  IF v_broadcast_sms THEN
    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.invitation_notifications AS notification
    WHERE notification.event_id = p_event_id
      AND notification.channel = 'sms'
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
      AND notification.channel = p_channel
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

REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer) TO service_role;

-- Retry must use the same split. A failed guest text is re-checked against the
-- broadcast budget; a failed host RSVP alert is re-checked against
-- sms_notification_limit and does not see broadcast rows. The row being
-- retried is excluded, matching the previous function.
DROP FUNCTION IF EXISTS public.retry_invitation_notification(uuid);

CREATE FUNCTION public.retry_invitation_notification(
  p_notification_id uuid,
  p_platform_sms_broadcast_limit integer DEFAULT NULL
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
  v_platform integer;
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
  v_platform := CASE
    WHEN p_platform_sms_broadcast_limit IS NOT NULL
      AND p_platform_sms_broadcast_limit > 0
      AND p_platform_sms_broadcast_limit <= 1000000
    THEN p_platform_sms_broadcast_limit
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
      AND notification.channel = v_notification.channel
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

REVOKE ALL ON FUNCTION public.retry_invitation_notification(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_invitation_notification(uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_invitation_notification(uuid, integer) TO service_role;
