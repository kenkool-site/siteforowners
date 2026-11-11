-- Hosts can hide InviteSpot guest-page branding (header pill, footer,
-- end-of-gallery card, upload success card, album card, and the
-- "Shared via InviteSpot" mark on the link preview). Default ON so existing
-- events keep the guest-page attribution until a host turns it off.
-- Guest photos are never watermarked either way.

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS memories_branding_enabled boolean NOT NULL DEFAULT true;

-- Optional length for the gallery video badge. Null on photos and on videos
-- uploaded before this column existed; the guest page omits the length tag
-- when it is null rather than inventing one.
ALTER TABLE public.memory_media
  ADD COLUMN IF NOT EXISTS duration_seconds integer;
