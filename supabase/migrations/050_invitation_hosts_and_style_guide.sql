ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS style_guide jsonb;

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_style_guide_object,
  ADD CONSTRAINT invitation_events_style_guide_object
    CHECK (style_guide IS NULL OR jsonb_typeof(style_guide) = 'object');

CREATE TABLE IF NOT EXISTS public.invitation_event_hosts (
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.invitation_owners(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('primary', 'cohost')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, owner_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS invitation_event_hosts_one_primary_idx
  ON public.invitation_event_hosts (event_id)
  WHERE role = 'primary';

CREATE UNIQUE INDEX IF NOT EXISTS invitation_event_hosts_one_cohost_idx
  ON public.invitation_event_hosts (event_id)
  WHERE role = 'cohost';

CREATE INDEX IF NOT EXISTS invitation_event_hosts_owner_idx
  ON public.invitation_event_hosts (owner_id, event_id);

INSERT INTO public.invitation_event_hosts (event_id, owner_id, role)
SELECT id, owner_id, 'primary'
FROM public.invitation_events
ON CONFLICT (event_id, owner_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_invitation_primary_host()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.invitation_event_hosts
  WHERE event_id = NEW.id
    AND (role = 'primary' OR owner_id = NEW.owner_id);

  INSERT INTO public.invitation_event_hosts (event_id, owner_id, role)
  VALUES (NEW.id, NEW.owner_id, 'primary');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invitation_events_sync_primary_host ON public.invitation_events;
CREATE TRIGGER invitation_events_sync_primary_host
AFTER INSERT OR UPDATE OF owner_id ON public.invitation_events
FOR EACH ROW EXECUTE FUNCTION public.sync_invitation_primary_host();

REVOKE ALL ON FUNCTION public.sync_invitation_primary_host() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_invitation_cohost(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_pin_hash text
)
RETURNS TABLE (owner_id uuid, reused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.invitation_events%ROWTYPE;
  v_owner public.invitation_owners%ROWTYPE;
  v_reused boolean := true;
BEGIN
  SELECT * INTO v_event FROM public.invitation_events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_EVENT_NOT_FOUND'; END IF;

  SELECT * INTO v_owner
  FROM public.invitation_owners
  WHERE email = lower(btrim(p_email));

  IF FOUND THEN
    IF NOT v_owner.is_active THEN RAISE EXCEPTION 'INVITE_COHOST_INACTIVE'; END IF;
    IF v_owner.id = v_event.owner_id THEN RAISE EXCEPTION 'INVITE_COHOST_IS_PRIMARY'; END IF;
  ELSE
    v_reused := false;
    INSERT INTO public.invitation_owners (name, email, pin_hash)
    VALUES (btrim(p_name), lower(btrim(p_email)), p_pin_hash)
    RETURNING * INTO v_owner;
  END IF;

  DELETE FROM public.invitation_event_hosts
  WHERE event_id = p_event_id AND role = 'cohost';
  INSERT INTO public.invitation_event_hosts (event_id, owner_id, role)
  VALUES (p_event_id, v_owner.id, 'cohost');

  RETURN QUERY SELECT v_owner.id, v_reused;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_invitation_cohost(p_event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.invitation_event_hosts
  WHERE event_id = p_event_id AND role = 'cohost';
$$;

REVOKE ALL ON FUNCTION public.set_invitation_cohost(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remove_invitation_cohost(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_invitation_cohost(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_invitation_cohost(uuid) TO service_role;

ALTER TABLE public.invitation_event_hosts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invitation_event_hosts FROM anon, authenticated;
