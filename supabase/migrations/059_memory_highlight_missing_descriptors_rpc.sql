-- 059_memory_highlight_missing_descriptors_rpc.sql
--
-- Fixes a real bug in the cross-event descriptor backfill query used by the
-- memories-highlights cron (src/app/api/cron/memories-highlights/route.ts,
-- listApprovedMediaMissingDescriptorsAcrossEvents in
-- src/lib/invitations/memories/repository.ts): the previous implementation
-- fetched only the oldest BACKFILL_SCAN_CAP (200) approved+uploaded media
-- rows and filtered out already-described ones AFTER that fetch. Once the
-- platform's total qualifying approved media passed ~200 and the oldest 200
-- were all already described (the normal steady state, since descriptors are
-- attached synchronously at approval for almost every path already), that
-- query returned an empty result forever — newer rows past the fixed window
-- were never even considered, no matter how many of them genuinely lacked a
-- descriptor.
--
-- This RPC does the "missing descriptor" test as a real LEFT JOIN ... WHERE
-- IS NULL at the SQL level, with LIMIT applied to the already-filtered
-- result (mirroring the shape of this migration's own
-- publish_memory_highlight_generation: a single, minimal SQL statement, no
-- discretionary application-side windowing to get wrong). It can't suffer
-- the same bug: however many already-described rows sit ahead of a genuinely
-- missing one in upload order, the anti-join simply skips them and keeps
-- going until it finds p_limit real matches (or exhausts the table).
CREATE OR REPLACE FUNCTION public.list_approved_media_missing_descriptors_across_events(p_limit integer)
RETURNS TABLE (
  media_id uuid,
  event_id uuid,
  media_kind text,
  object_key_display text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT media.id, media.event_id, media.media_kind, media.object_key_display
  FROM public.memory_media AS media
  LEFT JOIN public.memory_media_descriptors AS descriptor
    ON descriptor.media_id = media.id
  WHERE media.moderation_status = 'approved'
    AND media.upload_status = 'uploaded'
    AND descriptor.media_id IS NULL
  ORDER BY media.uploaded_at ASC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.list_approved_media_missing_descriptors_across_events(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_approved_media_missing_descriptors_across_events(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_approved_media_missing_descriptors_across_events(integer) TO service_role;

-- Supports the anti-join above at scale: without this, the planner has to
-- fall back to a sequential scan of memory_media (filtered by the two status
-- columns) to feed the join instead of an efficient ordered index scan that
-- can stop as soon as p_limit real matches are found.
CREATE INDEX IF NOT EXISTS memory_media_approved_uploaded_idx
  ON public.memory_media (uploaded_at)
  WHERE moderation_status = 'approved' AND upload_status = 'uploaded';
