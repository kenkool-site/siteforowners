-- Tenant-scoped settings the founder configures from the preview-only
-- editor (/admin/previews/[slug]/edit) before any tenant exists. The
-- canonical homes are tenants.booking_mode, tenants.email, and
-- booking_settings.deposit_*; for previews without a tenant these
-- columns hold the pending values until activation copies them into
-- their canonical homes (see /api/stripe-webhook checkout.session.completed).
ALTER TABLE previews
  ADD COLUMN IF NOT EXISTS booking_mode text DEFAULT 'in_site_only'
    CHECK (booking_mode IN ('in_site_only', 'external_only', 'both')),
  ADD COLUMN IF NOT EXISTS notification_email text,
  ADD COLUMN IF NOT EXISTS deposit_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_mode text
    CHECK (deposit_mode IS NULL OR deposit_mode IN ('fixed', 'percent')),
  ADD COLUMN IF NOT EXISTS deposit_value numeric(10, 2),
  ADD COLUMN IF NOT EXISTS deposit_cashapp text,
  ADD COLUMN IF NOT EXISTS deposit_zelle text,
  ADD COLUMN IF NOT EXISTS deposit_other_label text,
  ADD COLUMN IF NOT EXISTS deposit_other_value text;

COMMENT ON COLUMN previews.booking_mode IS
  'Founder-set booking mode for preview-only sites (no tenant yet).
   Copied to tenants.booking_mode at activation.';

COMMENT ON COLUMN previews.notification_email IS
  'Founder-set notification email for preview-only sites (no tenant yet).
   Copied to tenants.email at activation.';

COMMENT ON COLUMN previews.deposit_required IS
  'Founder-set deposit requirement for preview-only sites. Copied to
   booking_settings.deposit_required at activation.';
