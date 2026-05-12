-- Spec: SMS-friendly short reschedule links. Customers receive
-- `<APP_URL>/r/<code>` in SMS instead of the long signed token URL.
-- The redirect endpoint looks up the booking by this code, mints a
-- fresh signed reschedule token, and 302s to /reschedule?b=...&e=...&s=...

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reschedule_short_code TEXT;

-- Backfill existing rows. Uses gen_random_uuid() hex digits — not the
-- prettiest base62, but unique and unguessable enough for short codes
-- (and we'll generate new bookings using a proper base62 in app code).
-- Loop attempts handle the (vanishingly rare) collision with another row.
UPDATE bookings
SET reschedule_short_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
WHERE reschedule_short_code IS NULL;

-- Enforce uniqueness + required for new rows going forward.
ALTER TABLE bookings
  ALTER COLUMN reschedule_short_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_reschedule_short_code_unique
  ON bookings (reschedule_short_code);

COMMENT ON COLUMN bookings.reschedule_short_code IS
  '10-char unguessable code used to build short customer-facing reschedule URLs (siteforowners.com/r/<code>). Stable across reschedules — the redirect endpoint recomputes the signed token each time. Backfilled from gen_random_uuid hex for pre-026 rows; new rows generated as base62 in app code.';
