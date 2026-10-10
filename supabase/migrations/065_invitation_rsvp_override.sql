ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS rsvp_override_open boolean NOT NULL DEFAULT false;
