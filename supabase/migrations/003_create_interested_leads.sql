-- Prospects who clicked "Get Started" on a preview page
CREATE TABLE IF NOT EXISTS interested_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_slug text NOT NULL,
  business_name text NOT NULL,
  owner_name text NOT NULL,
  phone text NOT NULL,
  email text,
  message text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_interested_leads_created_at ON interested_leads (created_at DESC);
CREATE INDEX idx_interested_leads_slug ON interested_leads (preview_slug);
