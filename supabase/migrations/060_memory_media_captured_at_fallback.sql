-- 060_memory_media_captured_at_fallback.sql
--
-- Fixes a real bug: memory_media.captured_at has been NULL for every photo
-- ever uploaded through this feature. The design spec
-- (docs/superpowers/specs/2026-09-21-invitespot-memories-experience-design.md:67)
-- says captured_at should come "from EXIF when present, else upload time" —
-- but no code path ever implemented either half: EXIF extraction was never
-- built (the processing worker's decode-resize-re-encode step strips EXIF as
-- a side effect before any such extraction could read it), and the "else
-- upload time" fallback was never wired into createPendingMemoryMedia's
-- insert either. Since momentForMedia (gallery-view.ts) and
-- groupMediaByTime (the gallery's "Tonight"/"This afternoon"/"Earlier"
-- sections) both require a non-null captured_at to place a photo anywhere,
-- every photo silently fell through as ungrouped — reported as a host
-- creating a Moment, uploading a photo inside its time window, and the
-- photo never appearing in it.
--
-- Fix: default captured_at to now() at insert time, exactly like
-- uploaded_at's own existing DEFAULT now() (memory_media already omits
-- captured_at from its INSERT entirely in createPendingMemoryMedia, so this
-- takes effect for every future upload with zero application code changes).
-- A real EXIF-derived value can still be added later without conflicting —
-- a column default only ever applies when a value isn't explicitly given.
--
-- Also backfills every already-uploaded row that's stuck at NULL today, so
-- existing approved photos become groupable retroactively rather than only
-- fixing it going forward. Safe to re-run: the backfill only touches rows
-- still NULL, and SET DEFAULT is idempotent.
ALTER TABLE public.memory_media ALTER COLUMN captured_at SET DEFAULT now();

UPDATE public.memory_media
SET captured_at = uploaded_at
WHERE captured_at IS NULL;
