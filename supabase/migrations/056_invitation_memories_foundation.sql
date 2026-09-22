-- 056_invitation_memories_foundation.sql

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS memories_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS memories_mode text NOT NULL DEFAULT 'auto_publish';

ALTER TABLE public.invitation_events
  DROP CONSTRAINT IF EXISTS invitation_events_memories_mode_check,
  ADD CONSTRAINT invitation_events_memories_mode_check
    CHECK (memories_mode IN ('auto_publish', 'review_required'));

CREATE TABLE IF NOT EXISTS public.memory_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,

  uploader_rsvp_id uuid REFERENCES public.invitation_rsvps(id) ON DELETE SET NULL,
  uploader_display_name text,
  guest_session_level text NOT NULL
    CHECK (guest_session_level IN ('rsvp_guest', 'anonymous')),

  media_kind text NOT NULL
    CHECK (media_kind IN ('photo', 'video')),
  object_key_original text NOT NULL UNIQUE,
  object_key_display text,
  object_key_thumbnail text,

  captured_at timestamptz,
  uploaded_at timestamptz NOT NULL DEFAULT now(),

  upload_status text NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'uploaded', 'upload_failed')),
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'processing_failed')),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'awaiting_host_review', 'approved', 'flagged', 'rejected')),
  ai_status text NOT NULL DEFAULT 'not_started'
    CHECK (ai_status IN ('not_started', 'processing', 'enriched', 'ai_failed')),

  moderation_score numeric,
  moderation_categories text[],

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_media_event_captured_idx ON public.memory_media (event_id, captured_at);
CREATE INDEX IF NOT EXISTS memory_media_event_moderation_pending_idx ON public.memory_media (event_id, moderation_status)
  WHERE moderation_status IN ('pending', 'awaiting_host_review', 'flagged');

ALTER TABLE public.memory_media ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  guest_session_fingerprint text NOT NULL,
  total_files integer NOT NULL,
  completed_files integer NOT NULL DEFAULT 0,
  failed_files integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE public.memory_moments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_moment_media (
  media_id uuid PRIMARY KEY REFERENCES public.memory_media(id) ON DELETE CASCADE,
  moment_id uuid NOT NULL REFERENCES public.memory_moments(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('host_override', 'ai_classified')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_moment_media ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.memory_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.memory_media(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('derivative', 'ai_enrich')),
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'dead_letter')),
  error_code text,
  error_detail text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (media_id, job_type, attempt)
);

ALTER TABLE public.memory_processing_jobs ENABLE ROW LEVEL SECURITY;
