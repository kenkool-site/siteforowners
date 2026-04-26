-- Adds SMS opt-in tracking on bookings, an owner SMS-receiving phone,
-- and an index supporting the daily reminder cron query.

-- 1. SMS opt-in + reminder sent flag on each booking
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_sms_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS sms_reminder_sent boolean NOT NULL DEFAULT false;

-- 2. Owner SMS-receiving phone. Falls back to tenants.phone if NULL when sending.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS sms_phone text;

-- 3. Partial index on the cron's "due reminders" query: scans confirmed
-- bookings on a given date that haven't received their reminder yet.
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_due
  ON bookings (booking_date, status)
  WHERE sms_reminder_sent = false;
