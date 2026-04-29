-- Spec 5 follow-up: replace the free-text deposit_instructions field with
-- structured payment method handles. Owner picks among CashApp, Zelle, and
-- one custom Other (label + value). Customer-facing surfaces render only
-- the populated rows; CashApp renders as a clickable cash.app/$handle link.
--
-- The legacy deposit_instructions column is left in place for safety —
-- nothing reads or writes it after this migration. A future cleanup can
-- drop it once we're confident no rows still rely on it.
ALTER TABLE booking_settings
  ADD COLUMN IF NOT EXISTS deposit_cashapp text,
  ADD COLUMN IF NOT EXISTS deposit_zelle text,
  ADD COLUMN IF NOT EXISTS deposit_other_label text,
  ADD COLUMN IF NOT EXISTS deposit_other_value text;

COMMENT ON COLUMN booking_settings.deposit_cashapp IS
  'Cashtag without the leading $ (stored bare; UI/email prepend the $).';
COMMENT ON COLUMN booking_settings.deposit_zelle IS
  'Free-form Zelle handle — phone number or email.';
COMMENT ON COLUMN booking_settings.deposit_other_label IS
  'Custom payment method label (e.g. "Venmo"). Paired with deposit_other_value.';
COMMENT ON COLUMN booking_settings.deposit_other_value IS
  'Custom payment method handle (e.g. "@mariam-pro"). Paired with deposit_other_label.';
