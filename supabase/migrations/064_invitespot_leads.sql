-- Lead capture from the invitespot.app landing page's "Tell us about your
-- event" form. Separate from marketing_leads (SiteForOwners' own salon/
-- barbershop lead funnel) — different business line, different fields.
CREATE TABLE IF NOT EXISTS invitespot_leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text,
  phone         text,
  event_type    text NOT NULL,
  rough_date    text,
  guest_count   integer,
  referral_slug text,
  status        text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'archived')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitespot_leads_created_at
  ON invitespot_leads (created_at DESC);

-- No public policies: all access is via the service-role admin client,
-- matching marketing_leads.
ALTER TABLE invitespot_leads ENABLE ROW LEVEL SECURITY;
