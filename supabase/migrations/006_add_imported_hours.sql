-- Snapshot of hours as originally imported from Google Maps.
-- Mutated only by the Google Maps import flow.
-- Used by SiteEditor's "Reset to Google Maps" button to restore the original.
ALTER TABLE previews ADD COLUMN IF NOT EXISTS imported_hours jsonb;
