-- MANUAL data fix for Kenneth. Do not apply this by deploying the app.
-- This file is not in supabase/migrations, so the migration runner will not run it.
--
-- Mercy & John's invitation says 1:00 PM in Dallas, Texas (America/Chicago).
-- The row is stored as 2026-12-19 18:00:00+00 with timezone America/New_York,
-- which is 1:00 PM Eastern and 12:00 PM in Dallas.
-- 1:00 PM America/Chicago on that date is 2026-12-19 19:00:00+00.
--
-- Schedule items were entered in the editor against America/New_York, so their
-- instants are also one hour early for Dallas. This shifts those instants by
-- one hour together with the event start and end, and only when the row still
-- matches the known bad start. Run the SELECT first and stop if it is not the
-- expected row.

-- 1. Review the row. Expect timezone America/New_York and starts_at 2026-12-19 18:00:00+00.
SELECT id, slug, public_subdomain, timezone, starts_at, ends_at, rsvp_deadline, event_schedule
FROM invitation_events
WHERE public_subdomain = 'mercy-john'
   OR slug = 'mercy-john';

-- 2. Apply only if the SELECT shows the known bad start.
UPDATE invitation_events
SET
  timezone = 'America/Chicago',
  starts_at = '2026-12-19T19:00:00Z',
  ends_at = CASE WHEN ends_at IS NULL THEN NULL ELSE ends_at + interval '1 hour' END,
  event_schedule = (
    SELECT COALESCE(
      jsonb_agg(
        CASE
          WHEN jsonb_typeof(item -> 'startsAt') = 'string'
          THEN jsonb_set(
            item,
            '{startsAt}',
            to_jsonb(to_char((item ->> 'startsAt')::timestamptz + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          )
          ELSE item
        END
        ORDER BY ordinality
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(event_schedule) WITH ORDINALITY AS schedule(item, ordinality)
  ),
  updated_at = now()
WHERE (public_subdomain = 'mercy-john' OR slug = 'mercy-john')
  AND timezone = 'America/New_York'
  AND starts_at = '2026-12-19 18:00:00+00';

-- 3. Confirm: timezone America/Chicago, starts_at 2026-12-19 19:00:00+00,
-- and each schedule startsAt one hour later than before.
SELECT id, timezone, starts_at, ends_at, event_schedule
FROM invitation_events
WHERE public_subdomain = 'mercy-john'
   OR slug = 'mercy-john';
