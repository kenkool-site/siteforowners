-- Longer guest videos with Cloudflare Stream.
--
-- Each guest video's original stays in R2. When Stream is set up (see
-- src/lib/invitations/memories/stream.ts), Stream copies the original after
-- the upload finishes and keeps a phone-sized, adaptive copy:
--   stream_uid      Stream's id for that copy
--   stream_status   copying -> ready, or failed; archived once the archive job
--                   has deleted the copy (the R2 original keeps playing)
--   stream_hls_url  Stream's playback link, recorded once the copy is ready
--
-- memories_video_minutes_cap caps the total minutes of guest video one event
-- may hold. NULL uses the platform default the app passes:
-- MEMORIES_VIDEO_MINUTES_PER_EVENT, otherwise 600.
--
-- The app reads these columns defensively, so it can deploy before or after
-- this migration runs; Stream copies start only once both are in place.

ALTER TABLE public.memory_media
  ADD COLUMN IF NOT EXISTS stream_uid text,
  ADD COLUMN IF NOT EXISTS stream_status text
    CHECK (stream_status IS NULL OR stream_status IN ('copying', 'ready', 'failed', 'archived')),
  ADD COLUMN IF NOT EXISTS stream_hls_url text;

CREATE INDEX IF NOT EXISTS memory_media_stream_uid_idx
  ON public.memory_media (event_id)
  WHERE stream_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS memory_media_guest_long_video_idx
  ON public.memory_media (event_id, uploader_session_id)
  WHERE media_kind = 'video' AND duration_seconds > 61;

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS memories_video_minutes_cap integer
  CHECK (memories_video_minutes_cap IS NULL OR (memories_video_minutes_cap > 0 AND memories_video_minutes_cap <= 100000));

COMMENT ON COLUMN public.invitation_events.memories_video_minutes_cap IS
  'Total minutes of guest video this event may hold. NULL uses MEMORIES_VIDEO_MINUTES_PER_EVENT or 600.';
