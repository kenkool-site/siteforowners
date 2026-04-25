-- Owner admin Home + visitor tracking.
-- Part 2 of 4 migrations.

-- Per-day visit counter
CREATE TABLE IF NOT EXISTS site_visits (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
CREATE INDEX IF NOT EXISTS idx_site_visits_tenant_day
  ON site_visits (tenant_id, day DESC);
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

-- Atomic increment: insert (1) on first call, add 1 on subsequent.
-- Returns the new count so callers can observe success.
CREATE OR REPLACE FUNCTION increment_site_visit(p_tenant_id uuid, p_day date)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  new_count integer;
BEGIN
  INSERT INTO site_visits (tenant_id, day, count)
  VALUES (p_tenant_id, p_day, 1)
  ON CONFLICT (tenant_id, day)
  DO UPDATE SET count = site_visits.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

-- Contact form submissions from published tenant sites.
-- Home's "Unread leads" rollup reads this. Plan 3 wires the contact
-- form to write to it.
CREATE TABLE IF NOT EXISTS contact_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  message text,
  source_page text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_leads_tenant_created
  ON contact_leads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_unread
  ON contact_leads (tenant_id) WHERE is_read = false;
ALTER TABLE contact_leads ENABLE ROW LEVEL SECURITY;
