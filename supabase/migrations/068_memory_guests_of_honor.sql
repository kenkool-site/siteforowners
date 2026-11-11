-- Host-only "guests of honor" face grouping for Memories.
-- One set per event. The reference photo and face crops live in the memories
-- bucket (object keys below) and are never returned to guests. Match rows
-- point at gallery media; excluded = true is a host correction that later
-- re-matching must not undo.
--
-- Face data retention: Find Me does not persist face vectors (the selfie is
-- discarded after the search), and there is no event-end job that deletes
-- stored face data. Removing tagging deletes these rows (and the app deletes
-- the stored reference photo and crops). A scheduled post-event wipe is not
-- implemented here because nothing else in Memories deletes face data when
-- an event ends.

CREATE TABLE IF NOT EXISTS public.memory_honor_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'ready')),
  source_kind text NOT NULL CHECK (source_kind IN ('event_site', 'upload')),
  source_ref text,
  source_object_key text,
  consented_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.memory_honorees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  honor_set_id uuid NOT NULL REFERENCES public.memory_honor_sets(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  role_key text NOT NULL,
  selected boolean NOT NULL DEFAULT true,
  face_index integer NOT NULL CHECK (face_index >= 0),
  box_left double precision NOT NULL,
  box_top double precision NOT NULL,
  box_width double precision NOT NULL,
  box_height double precision NOT NULL,
  crop_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (honor_set_id, face_index)
);

CREATE TABLE IF NOT EXISTS public.memory_honor_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  honoree_id uuid NOT NULL REFERENCES public.memory_honorees(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.memory_media(id) ON DELETE CASCADE,
  similarity real NOT NULL,
  excluded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (honoree_id, media_id)
);

CREATE INDEX IF NOT EXISTS memory_honorees_event_id_idx ON public.memory_honorees (event_id);
CREATE INDEX IF NOT EXISTS memory_honor_matches_event_media_idx ON public.memory_honor_matches (event_id, media_id);

ALTER TABLE public.memory_honor_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_honorees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_honor_matches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.memory_honor_sets FROM anon, authenticated;
REVOKE ALL ON public.memory_honorees FROM anon, authenticated;
REVOKE ALL ON public.memory_honor_matches FROM anon, authenticated;
