-- Owner admin tooling: Updates page + forgot-PIN reset flow.
-- Final part of the 4-migration owner-admin series.

CREATE TABLE IF NOT EXISTS update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL
    CHECK (category IN ('hours', 'photo', 'service', 'pricing', 'text', 'other')),
  description text NOT NULL,
  attachment_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_update_requests_tenant_status
  ON update_requests (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_update_requests_pending
  ON update_requests (created_at DESC) WHERE status != 'done';
ALTER TABLE update_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS admin_pin_resets (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_admin_pin_resets_tenant
  ON admin_pin_resets (tenant_id);
ALTER TABLE admin_pin_resets ENABLE ROW LEVEL SECURITY;

-- Storage bucket for update-request attachments. Private (signed URLs only).
INSERT INTO storage.buckets (id, name, public)
VALUES ('update-attachments', 'update-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: only the service role can read/write. Tenant scoping is enforced
-- in the API layer (the route validates the owner session and constructs the
-- path as {tenant_id}/{request_id}.{ext}).
DROP POLICY IF EXISTS "service_role_all" ON storage.objects;
CREATE POLICY "service_role_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'update-attachments')
  WITH CHECK (bucket_id = 'update-attachments');
