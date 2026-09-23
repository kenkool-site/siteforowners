ALTER TABLE public.memory_media
  ADD COLUMN IF NOT EXISTS uploader_session_id uuid;

CREATE INDEX IF NOT EXISTS memory_media_event_contributor_idx
  ON public.memory_media (event_id, uploader_session_id)
  WHERE uploader_session_id IS NOT NULL;

COMMENT ON COLUMN public.memory_media.uploader_session_id IS
  'Stable anonymous browser-session identifier used only for aggregate contributor counts.';
