-- 058_memory_highlight_grouping.sql
--
-- Independent, multi-group semantic highlight system for the Memories
-- "AI Highlight" tab. This is a new, separate concern from timestamp-based
-- Moments (memory_moments / memory_moment_media, added in
-- 056_invitation_memories_foundation.sql): AI Highlight code must never read
-- from or write to those tables. This migration does not touch them.
--
-- Four new tables:
--   memory_media_descriptors     -- reusable AI input extracted once per media item
--   memory_highlight_groups      -- automatic, fallback, or host-defined group definitions
--   memory_highlight_generations -- one complete classification attempt; atomic publish boundary
--   memory_highlight_media       -- many-to-many membership, scoped to a generation
--
-- Plus an extension of invitation_events with the approved highlight
-- settings/state, and a SQL RPC that atomically publishes a completed
-- generation.

CREATE TABLE IF NOT EXISTS public.memory_media_descriptors (
  media_id uuid PRIMARY KEY REFERENCES public.memory_media(id) ON DELETE CASCADE,
  descriptor_version text NOT NULL,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding jsonb,
  transcript_cues jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_media_descriptors ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_highlight_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  semantic_key text NOT NULL,
  source text NOT NULL
    CHECK (source IN ('fallback', 'ai_generated', 'host_defined')),
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, source, semantic_key)
);

CREATE INDEX IF NOT EXISTS memory_highlight_groups_event_idx
  ON public.memory_highlight_groups (event_id, sort_order);

ALTER TABLE public.memory_highlight_groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_highlight_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  mode text NOT NULL
    CHECK (mode IN ('fallback', 'automatic', 'host_defined')),
  status text NOT NULL
    CHECK (status IN ('queued', 'processing', 'published', 'failed')),
  media_count integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS memory_highlight_generations_event_idx
  ON public.memory_highlight_generations (event_id, created_at);

-- Only one queued or processing generation may exist per event at a time
-- (published/failed generations are excluded so history can accumulate).
CREATE UNIQUE INDEX IF NOT EXISTS memory_highlight_generations_one_pending_idx
  ON public.memory_highlight_generations (event_id)
  WHERE status IN ('queued', 'processing');

ALTER TABLE public.memory_highlight_generations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_highlight_media (
  group_id uuid NOT NULL REFERENCES public.memory_highlight_groups(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES public.memory_media(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL REFERENCES public.memory_highlight_generations(id) ON DELETE CASCADE,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (generation_id, group_id, media_id)
);

CREATE INDEX IF NOT EXISTS memory_highlight_media_media_idx
  ON public.memory_highlight_media (media_id);

CREATE INDEX IF NOT EXISTS memory_highlight_media_group_idx
  ON public.memory_highlight_media (group_id);

ALTER TABLE public.memory_highlight_media ENABLE ROW LEVEL SECURITY;

-- Event-level highlight settings and generation state. Added after
-- memory_highlight_generations exists so the pointer columns can carry a
-- real foreign key (cleared automatically if a generation row is ever
-- removed, rather than left dangling).

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS highlight_mode text NOT NULL DEFAULT 'automatic';

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_highlight_mode_check,
  ADD CONSTRAINT invitation_events_highlight_mode_check
    CHECK (highlight_mode IN ('automatic', 'host_defined'));

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS published_highlight_generation_id uuid
    REFERENCES public.memory_highlight_generations(id) ON DELETE SET NULL;

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS pending_highlight_generation_id uuid
    REFERENCES public.memory_highlight_generations(id) ON DELETE SET NULL;

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS highlight_generation_status text NOT NULL DEFAULT 'idle';

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_highlight_generation_status_check,
  ADD CONSTRAINT invitation_events_highlight_generation_status_check
    CHECK (highlight_generation_status IN ('idle', 'queued', 'processing', 'failed'));

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS highlight_generation_error text;

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS highlight_last_generated_media_count integer NOT NULL DEFAULT 0;

-- Atomically publishes a completed highlight generation: verifies the
-- generation belongs to the event and is still processing, marks it
-- published, updates the event's published pointer/count/status, and
-- clears the pending pointer/error. A single SQL function body executes as
-- one statement and is therefore already transactional in Postgres; the
-- generation row is locked FOR UPDATE so a concurrent caller can never
-- observe (or apply) a partial publish, and an invalid call raises instead
-- of silently updating nothing.
CREATE OR REPLACE FUNCTION public.publish_memory_highlight_generation(p_event_id uuid, p_generation_id uuid, p_media_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generation public.memory_highlight_generations%ROWTYPE;
BEGIN
  SELECT generation.*
  INTO v_generation
  FROM public.memory_highlight_generations AS generation
  WHERE generation.id = p_generation_id
    AND generation.event_id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = 'HIGHLIGHT_GENERATION_NOT_FOUND';
  END IF;

  IF v_generation.status <> 'processing' THEN
    RAISE EXCEPTION USING MESSAGE = 'HIGHLIGHT_GENERATION_NOT_PROCESSING';
  END IF;

  UPDATE public.memory_highlight_generations
  SET status = 'published',
      media_count = p_media_count,
      published_at = pg_catalog.now()
  WHERE id = p_generation_id;

  UPDATE public.invitation_events
  SET published_highlight_generation_id = p_generation_id,
      highlight_last_generated_media_count = p_media_count,
      highlight_generation_status = 'idle',
      pending_highlight_generation_id = NULL,
      highlight_generation_error = NULL
  WHERE id = p_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_memory_highlight_generation(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_memory_highlight_generation(uuid, uuid, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_memory_highlight_generation(uuid, uuid, integer) TO service_role;
