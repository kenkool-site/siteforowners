-- Owner-defined booking policies (deposit, lateness, reschedule rules,
-- etc.) shown on the booking modal's schedule step before the customer
-- confirms. Plain text; owner formats with newlines. Empty = no policies
-- displayed (booking modal omits the section entirely).

ALTER TABLE previews
  ADD COLUMN IF NOT EXISTS booking_policies text;

COMMENT ON COLUMN previews.booking_policies IS
  'Spec 4 polish: free-form booking terms shown on the booking modal''s
   schedule step. The first non-empty line is used as a compact headline;
   the full text renders inside a slide-up drawer the customer can open
   from a "View booking policies" link. NULL or empty = no callout.';
