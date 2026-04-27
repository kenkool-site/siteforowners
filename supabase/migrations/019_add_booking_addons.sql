-- Spec 4 (booking polish): persist customer-selected add-ons on each booking
-- so SMS templates and admin schedule can render them.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS selected_add_ons jsonb,
  ADD COLUMN IF NOT EXISTS add_ons_total_price numeric(10, 2);

COMMENT ON COLUMN bookings.selected_add_ons IS
  'Spec 4: snapshot of customer-selected add-ons at booking time. Schema:
   [{name: text, price_delta: number, duration_delta_minutes: integer}].
   Snapshotted (not joined) so deletes/edits to the service do not orphan
   historical bookings.';

COMMENT ON COLUMN bookings.add_ons_total_price IS
  'Spec 4: sum of price_delta across selected_add_ons at booking time.
   Stored separately so SMS/schedule rendering does not need to walk
   the JSONB array.';
