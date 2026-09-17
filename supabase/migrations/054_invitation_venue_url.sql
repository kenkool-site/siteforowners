ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS venue_url text;

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_venue_url_https_check;

ALTER TABLE public.invitation_events
  ADD CONSTRAINT invitation_events_venue_url_https_check
  CHECK (venue_url IS NULL OR venue_url ~* '^https://');

COMMENT ON COLUMN public.invitation_events.venue_url IS
  'Optional HTTPS website for the public event venue.';
