-- Spec 6: customer self-serve + owner-initiated reschedule.
--
-- Single counter column. Customer self-serve limit is 1; owner-initiated
-- reschedules also increment this counter. Used to (a) enforce the limit
-- on the customer endpoint and (b) render an "already moved" badge in
-- admin so the owner sees the customer has used their quota.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reschedule_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN bookings.reschedule_count IS
  'Spec 6: number of times this booking has been rescheduled, by either
   the customer (self-serve) or the owner. Customer endpoint enforces
   < 1; owner endpoint bypasses but still increments.';
