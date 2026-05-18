-- Post-appointment Google review SMS: one send per booking, gated by previews.google_review_url.

ALTER TABLE previews
  ADD COLUMN IF NOT EXISTS google_review_url text;

COMMENT ON COLUMN previews.google_review_url IS
  'Leave-a-review URL (typically Google writereview). SMS review requests omit when NULL/blank.';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS sms_review_request_sent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_review_followup_candidates
  ON bookings (booking_date)
  WHERE status = 'confirmed'
    AND customer_sms_opt_in = true
    AND sms_review_request_sent = false;
