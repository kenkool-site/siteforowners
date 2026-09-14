-- Atomic gallery insertion keeps the per-event hard cap correct under concurrency.

CREATE OR REPLACE FUNCTION insert_invitation_gallery_media(
  p_event_id uuid,
  p_storage_path text,
  p_alt_text text
)
RETURNS public.invitation_media
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_gallery_count integer;
  v_sort_order integer;
  v_media public.invitation_media;
BEGIN
  -- Every insertion for one event queues on this row lock. The count and insert
  -- therefore observe all earlier committed insertions in this transaction order.
  PERFORM 1
  FROM public.invitation_events
  WHERE id = p_event_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_event_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(*)
  INTO v_gallery_count
  FROM public.invitation_media
  WHERE event_id = p_event_id
    AND kind = 'gallery_image';
  IF v_gallery_count >= 12 THEN
    RAISE EXCEPTION 'invitation_gallery_full' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1) + 1
  INTO v_sort_order
  FROM public.invitation_media
  WHERE event_id = p_event_id
    AND kind = 'gallery_image';

  INSERT INTO public.invitation_media (
    event_id,
    kind,
    storage_path,
    alt_text,
    sort_order
  ) VALUES (
    p_event_id,
    'gallery_image',
    p_storage_path,
    p_alt_text,
    v_sort_order
  )
  RETURNING * INTO v_media;

  RETURN v_media;
END;
$$;

REVOKE ALL ON FUNCTION insert_invitation_gallery_media(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION insert_invitation_gallery_media(uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION insert_invitation_gallery_media(uuid, text, text) TO service_role;
