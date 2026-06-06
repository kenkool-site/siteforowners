-- 029_tenant_is_demo.sql
-- Founder "demo" provisioning: a preview can be turned into a real, subdomain-
-- backed tenant in a trialing/unpaid state so it renders like a converted
-- client. `is_demo` distinguishes those from real paying tenants and drives the
-- CTA banner, search-engine noindex, and the "Revert to preview" teardown guard.
-- A paid checkout flips this to false (see stripe-webhook upsert-by-preview_slug).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenants.is_demo IS
  'True for founder-provisioned unpaid demo tenants (subscription_status=trialing, no Stripe subscription). Flipped to false on paid activation. Drives the demo CTA banner, noindex, and the revert-to-preview guard.';

CREATE INDEX IF NOT EXISTS idx_tenants_is_demo ON tenants (is_demo) WHERE is_demo = true;
