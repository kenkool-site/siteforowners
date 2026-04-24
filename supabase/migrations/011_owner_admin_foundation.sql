-- Owner admin foundation: PIN auth + brute-force tracking.
-- Part 1 of 4 migrations. Later migrations add site_visits, contact_leads,
-- update_requests, admin_pin_resets.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS admin_pin_hash text,
  ADD COLUMN IF NOT EXISTS admin_pin_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_email text,
  -- booking_tool determines whether to show the Schedule tab in owner admin.
  -- Values: 'none' | 'internal' (show Schedule) | 'acuity' | 'booksy' | 'vagaro' | 'square' | 'cal' (hide).
  ADD COLUMN IF NOT EXISTS booking_tool text NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  ip_hash text,
  succeeded boolean NOT NULL,
  attempted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_recent
  ON admin_login_attempts (tenant_id, attempted_at DESC);

-- Service-role only. Deny-all for anon/authenticated.
ALTER TABLE admin_login_attempts ENABLE ROW LEVEL SECURITY;
