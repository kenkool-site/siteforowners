CREATE TABLE public.invitation_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  subject text,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  sent_by text NOT NULL CHECK (sent_by IN ('owner', 'founder')),
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  suppressed_count integer NOT NULL DEFAULT 0 CHECK (suppressed_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (channel <> 'email' OR NULLIF(btrim(subject), '') IS NOT NULL)
);

CREATE INDEX invitation_broadcasts_event_created_idx
  ON public.invitation_broadcasts (event_id, created_at DESC);

ALTER TABLE public.invitation_broadcasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_broadcasts FROM anon, authenticated;

ALTER TABLE public.invitation_notifications
  ADD COLUMN broadcast_id uuid REFERENCES public.invitation_broadcasts(id) ON DELETE CASCADE;

CREATE INDEX invitation_notifications_broadcast_id_idx
  ON public.invitation_notifications (broadcast_id)
  WHERE broadcast_id IS NOT NULL;

ALTER TABLE public.invitation_notifications
  DROP CONSTRAINT IF EXISTS invitation_notifications_kind_check;
ALTER TABLE public.invitation_notifications
  ADD CONSTRAINT invitation_notifications_kind_check
  CHECK (kind IN ('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast'));

ALTER TABLE public.invitation_events
  ALTER COLUMN sms_notification_limit SET DEFAULT 100;

-- There is no way to distinguish "still on the original default" from "a
-- founder deliberately chose 50"; this bumps both, per the approved design.
UPDATE public.invitation_events
  SET sms_notification_limit = 100
  WHERE sms_notification_limit = 50;

-- PostgreSQL cannot CREATE OR REPLACE a function whose parameter list
-- changes shape (it creates a second overload instead, which breaks
-- Supabase's named-parameter RPC dispatch) — the old 6-parameter version
-- must be dropped explicitly before the widened one is created.
DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text);

CREATE FUNCTION public.reserve_invitation_notification(
  p_event_id uuid,
  p_rsvp_id uuid,
  p_audience text,
  p_channel text,
  p_recipient text,
  p_kind text,
  p_broadcast_id uuid DEFAULT NULL
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

REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid) TO service_role;

-- Concurrency smoke: broadcast reservation shares the RSVP cap
-- 1. Seed a published event whose email_notification_limit is 2 and has 3 RSVPs with distinct emails.
-- 2. Call reserve_invitation_notification three times with audience='guest', kind='celebrant_broadcast',
--    a fresh broadcast_id, and each RSVP's id/email.
-- 3. Exactly two calls return allowed=true; the third returns allowed=false (a 'suppressed' row).
-- 4. Verify: select status, count(*) from invitation_notifications where broadcast_id = '<id>' group by status;
--    expect two of ('pending' or 'sent'/'failed' once the app layer runs) and one 'suppressed'.
