-- UPDATE already holds the event row lock shared by both RSVP RPC modes.
-- This VOLATILE trigger's attendance query sees commits made while UPDATE waited.
CREATE OR REPLACE FUNCTION public.guard_invitation_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attending bigint;
BEGIN
  IF NEW.capacity IS NOT NULL AND NEW.capacity IS DISTINCT FROM OLD.capacity THEN
    SELECT COALESCE(pg_catalog.sum(rsvp.party_size), 0) INTO v_attending
    FROM public.invitation_rsvps AS rsvp WHERE rsvp.event_id = NEW.id AND rsvp.attending;
    IF NEW.capacity < v_attending THEN
      RAISE EXCEPTION USING MESSAGE = 'INVITE_CAPACITY_BELOW_ATTENDANCE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invitation_capacity_guard
BEFORE UPDATE OF capacity ON public.invitation_events FOR EACH ROW
EXECUTE FUNCTION public.guard_invitation_capacity();
REVOKE ALL ON FUNCTION public.guard_invitation_capacity() FROM PUBLIC, anon, authenticated;

-- Private capability-bearing provider input. Never select this column for a dashboard.
ALTER TABLE public.invitation_notifications ADD COLUMN provider_payload_encrypted text;
CREATE OR REPLACE FUNCTION public.guard_invitation_notification_payload()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.provider_payload_encrypted IS NOT NULL
    AND NEW.provider_payload_encrypted IS DISTINCT FROM OLD.provider_payload_encrypted THEN
    RAISE EXCEPTION 'INVITE_NOTIFICATION_PAYLOAD_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invitation_notification_payload_immutable
BEFORE UPDATE OF provider_payload_encrypted ON public.invitation_notifications FOR EACH ROW
EXECUTE FUNCTION public.guard_invitation_notification_payload();
REVOKE ALL ON FUNCTION public.guard_invitation_notification_payload() FROM PUBLIC, anon, authenticated;
