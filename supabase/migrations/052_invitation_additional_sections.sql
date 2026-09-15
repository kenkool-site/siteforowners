ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS additional_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_additional_sections_check;

ALTER TABLE public.invitation_events
  ADD CONSTRAINT invitation_events_additional_sections_check
  CHECK (
    jsonb_typeof(additional_sections) = 'array'
    AND jsonb_array_length(additional_sections) <= 8
  );
