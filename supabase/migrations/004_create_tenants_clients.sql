-- Tenants: each paying business is a tenant
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  business_type text,
  phone text,
  email text,
  address text,
  owner_name text NOT NULL,
  -- Stripe
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text,
  subscription_status text DEFAULT 'pending', -- pending, active, past_due, canceled
  -- Site
  preview_slug text REFERENCES previews(slug),
  subdomain text UNIQUE, -- e.g. "letstrylocs" → letstrylocs.siteforowners.com
  custom_domain text UNIQUE, -- e.g. letstrylocs.com
  site_published boolean DEFAULT false,
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_tenants_stripe_customer ON tenants (stripe_customer_id);
CREATE INDEX idx_tenants_subscription_status ON tenants (subscription_status);
CREATE INDEX idx_tenants_subdomain ON tenants (subdomain);

-- Track lead → tenant conversion
ALTER TABLE interested_leads ADD COLUMN IF NOT EXISTS converted boolean DEFAULT false;
ALTER TABLE interested_leads ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE interested_leads ADD COLUMN IF NOT EXISTS converted_at timestamptz;
