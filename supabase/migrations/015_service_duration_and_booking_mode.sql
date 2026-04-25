-- Adds per-service duration support and per-tenant booking_mode for the
-- dual booking entry (in-site primary + external quiet link).

-- 1. tenants.booking_mode (3-state: in_site_only | external_only | both)
ALTER TABLE tenants
  ADD COLUMN booking_mode text NOT NULL DEFAULT 'in_site_only'
  CHECK (booking_mode IN ('in_site_only', 'external_only', 'both'));

-- Backfill: tenants currently using an external provider keep today's
-- behavior. booking_url lives at previews.generated_copy ->> 'booking_url',
-- joined to tenants via preview_slug.
UPDATE tenants t
   SET booking_mode = 'external_only'
  FROM previews p
 WHERE p.slug = t.preview_slug
   AND COALESCE(p.generated_copy ->> 'booking_url', '') <> '';

-- 2. bookings.duration_minutes (immutable per-booking duration)
ALTER TABLE bookings
  ADD COLUMN duration_minutes integer NOT NULL DEFAULT 60;

-- 3. previews.services[*].duration_minutes backfill — every service item
-- without a duration_minutes field gets 60.
UPDATE previews
   SET services = (
     SELECT jsonb_agg(
       CASE
         WHEN item ? 'duration_minutes' THEN item
         ELSE item || jsonb_build_object('duration_minutes', 60)
       END
     )
     FROM jsonb_array_elements(services) AS item
   )
 WHERE jsonb_typeof(services) = 'array'
   AND jsonb_array_length(services) > 0;
