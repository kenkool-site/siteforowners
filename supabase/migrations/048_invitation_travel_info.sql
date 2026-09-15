ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS travel_info jsonb NOT NULL DEFAULT '{"airports": [], "hotels": []}'::jsonb;

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_travel_info_shape;

ALTER TABLE public.invitation_events
  ADD CONSTRAINT invitation_events_travel_info_shape CHECK (
    jsonb_typeof(travel_info) = 'object'
    AND travel_info ? 'airports'
    AND travel_info ? 'hotels'
    AND jsonb_typeof(travel_info->'airports') = 'array'
    AND jsonb_typeof(travel_info->'hotels') = 'array'
    AND jsonb_array_length(travel_info->'airports') <= 3
    AND jsonb_array_length(travel_info->'hotels') <= 5
  );
