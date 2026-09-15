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

ALTER TABLE public.invitation_event_hosts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invitation_event_hosts FROM anon, authenticated;
