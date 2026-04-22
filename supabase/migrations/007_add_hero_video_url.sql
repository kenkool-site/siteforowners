-- Adds optional hero background video URL to previews.
-- NULL = no video, fall back to hero image (current behavior).

ALTER TABLE previews ADD COLUMN IF NOT EXISTS hero_video_url TEXT;
