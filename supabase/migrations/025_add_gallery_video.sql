-- Adds one optional gallery video that renders separately above image galleries.
-- NULL gallery_video_url = no gallery video.
-- NULL gallery_video_title = use template-specific default title.

ALTER TABLE previews ADD COLUMN IF NOT EXISTS gallery_video_url TEXT;
ALTER TABLE previews ADD COLUMN IF NOT EXISTS gallery_video_title TEXT;

UPDATE storage.buckets
SET
  allowed_mime_types = (
    SELECT array_agg(DISTINCT t)
    FROM unnest(
      coalesce(allowed_mime_types, array[]::text[])
      || ARRAY['video/mp4']
    ) AS t
  ),
  file_size_limit = greatest(coalesce(file_size_limit, 0), 26214400)
WHERE id = 'preview-images';
