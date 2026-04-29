-- Spec 5: optional per-tenant deposit flow.
--
-- booking_settings: per-tenant deposit configuration. Tenants without
-- deposit_required see today's flow unchanged.
ALTER TABLE booking_settings
  ADD COLUMN IF NOT EXISTS deposit_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_mode text CHECK (deposit_mode IN ('fixed', 'percent') OR deposit_mode IS NULL),
  ADD COLUMN IF NOT EXISTS deposit_value numeric(10, 2),
  ADD COLUMN IF NOT EXISTS deposit_instructions text;

COMMENT ON COLUMN booking_settings.deposit_required IS
  'Spec 5: when true, new bookings start as status=pending until the
   owner marks the deposit received. Off-platform payment.';
COMMENT ON COLUMN booking_settings.deposit_mode IS
  'Spec 5: ''fixed'' = flat dollar amount; ''percent'' = % of (service base + add-ons total).';
COMMENT ON COLUMN booking_settings.deposit_value IS
  'Spec 5: dollars when mode=fixed; integer 1..100 when mode=percent.';
COMMENT ON COLUMN booking_settings.deposit_instructions IS
  'Spec 5: free-form payment instructions shown prominently to the
   customer (Cash App handle, Zelle phone, etc.).';

-- bookings: deposit amount snapshotted at booking creation.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10, 2);

COMMENT ON COLUMN bookings.deposit_amount IS
  'Spec 5: server-computed deposit at booking creation time. NULL when
   the tenant did not require a deposit. Snapshotted (not derived) so
   later toggle changes do not affect historical bookings.';

-- The bookings.status column has no CHECK constraint to update —
-- 'pending' is a new conventional value enforced in code at the
-- create-booking and admin/bookings/status routes.
