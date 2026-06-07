-- Ad-form ("Request yours") submissions from /demo and the homepage CTA.
-- Separate from interested_leads (which is the preview-view funnel).
CREATE TABLE IF NOT EXISTS marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name    text NOT NULL,
  email            text NOT NULL,
  phone            text NOT NULL,
  business_address text,
  business_type    text NOT NULL,
  business_link    text,
  notes            text,
  source           text NOT NULL DEFAULT 'demo',   -- 'demo' | 'homepage'
  status           text NOT NULL DEFAULT 'new',     -- 'new' | 'contacted' | 'archived'
  preview_group_id text,                            -- group_id of a preview built from this lead
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_leads_created_at
  ON marketing_leads (created_at DESC);

-- No public policies: all access is via the service-role admin client.
ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
