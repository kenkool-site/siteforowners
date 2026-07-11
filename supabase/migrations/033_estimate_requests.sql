-- supabase/migrations/033_estimate_requests.sql
CREATE TABLE IF NOT EXISTS estimate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  service_needed text NOT NULL,
  job_location text NOT NULL,
  description text NOT NULL,
  preferred_response text NOT NULL
    CHECK (preferred_response IN ('call', 'sms', 'whatsapp')),
  locale text NOT NULL CHECK (locale IN ('en', 'es')),
  source_path text,
  notification_channel text
    CHECK (notification_channel IS NULL OR notification_channel IN ('sms', 'whatsapp')),
  notification_destination text,
  notification_state text NOT NULL DEFAULT 'pending'
    CHECK (notification_state IN ('pending', 'sent', 'failed')),
  provider_message_id text,
  provider_error text,
  photo_upload_warning boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

CREATE TABLE IF NOT EXISTS estimate_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  estimate_request_id uuid NOT NULL
    REFERENCES estimate_requests(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  content_type text NOT NULL
    CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 8388608),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, storage_path)
);

CREATE INDEX IF NOT EXISTS estimate_requests_tenant_created_idx
  ON estimate_requests (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS estimate_requests_failed_idx
  ON estimate_requests (tenant_id, created_at DESC)
  WHERE notification_state = 'failed';

CREATE INDEX IF NOT EXISTS estimate_photos_request_idx
  ON estimate_photos (tenant_id, estimate_request_id);

ALTER TABLE estimate_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_photos ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('estimate-photos', 'estimate-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Service role manages estimate photos'
  ) THEN
    CREATE POLICY "Service role manages estimate photos"
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'estimate-photos')
      WITH CHECK (bucket_id = 'estimate-photos');
  END IF;
END $$;
