ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS event_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;
