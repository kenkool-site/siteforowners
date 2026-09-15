-- Final objects are uploaded by the server only after validating downloaded bytes.
CREATE OR REPLACE FUNCTION public.attach_invitation_media(
  p_event_id uuid, p_kind text, p_storage_path text, p_media_id uuid DEFAULT NULL, p_alt_text text DEFAULT ''
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_event public.invitation_events%ROWTYPE;
  v_old_path text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('designed_invite', 'cover', 'gallery', 'video')
    OR p_storage_path IS NULL
    OR p_storage_path !~ ('^' || p_event_id::text || '/' || p_kind || '/[a-f0-9-]{36}[.](jpg|jpeg|png|webp|mp4|webm)$') THEN
    RAISE EXCEPTION 'invalid_media_reference';
  END IF;
  SELECT event.* INTO v_event FROM public.invitation_events AS event WHERE event.id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_event_not_found'; END IF;
  IF p_kind = 'gallery' THEN
    IF NULLIF(pg_catalog.btrim(p_alt_text), '') IS NULL THEN RAISE EXCEPTION 'gallery_alt_required'; END IF;
    IF p_media_id IS NULL THEN
      PERFORM public.insert_invitation_gallery_media(p_event_id, p_storage_path, p_alt_text);
    ELSE
      SELECT media.storage_path INTO v_old_path FROM public.invitation_media AS media
      WHERE media.id = p_media_id AND media.event_id = p_event_id AND media.kind = 'gallery_image' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'invalid_media_reference'; END IF;
      UPDATE public.invitation_media AS media SET storage_path = p_storage_path, alt_text = p_alt_text, updated_at = pg_catalog.now()
      WHERE media.id = p_media_id AND media.event_id = p_event_id;
    END IF;
  ELSE
    v_old_path := CASE p_kind WHEN 'designed_invite' THEN v_event.designed_invite_path WHEN 'cover' THEN v_event.cover_image_path ELSE v_event.video_path END;
    UPDATE public.invitation_events AS event SET
      designed_invite_path = CASE WHEN p_kind = 'designed_invite' THEN p_storage_path ELSE event.designed_invite_path END,
      cover_image_path = CASE WHEN p_kind = 'cover' THEN p_storage_path ELSE event.cover_image_path END,
      video_path = CASE WHEN p_kind = 'video' THEN p_storage_path ELSE event.video_path END,
      updated_at = pg_catalog.now()
    WHERE event.id = p_event_id;
  END IF;
  RETURN v_old_path;
END;
$$;
REVOKE ALL ON FUNCTION public.attach_invitation_media(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_invitation_media(uuid, text, text, uuid, text) TO service_role;
