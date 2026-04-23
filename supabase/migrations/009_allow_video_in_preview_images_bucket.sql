-- Allow hero video uploads (mp4, webm) into the preview-images bucket and
-- raise the bucket file size limit to 20MB to match the API-level cap in
-- src/app/api/upload-hero-video/route.ts.

update storage.buckets
set
  allowed_mime_types = (
    select array_agg(distinct t)
    from unnest(
      coalesce(allowed_mime_types, array[]::text[])
      || array['video/mp4', 'video/webm']
    ) as t
  ),
  file_size_limit = greatest(coalesce(file_size_limit, 0), 20971520)
where id = 'preview-images';
