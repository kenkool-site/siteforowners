-- Public-read bucket for owner-uploaded service images.
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so the rendered site can fetch directly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'service-images public read'
  ) THEN
    CREATE POLICY "service-images public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'service-images');
  END IF;
END$$;

-- Service-role-only writes (the API route uses the service role key).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'service-images service-role write'
  ) THEN
    CREATE POLICY "service-images service-role write"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'service-images');
  END IF;
END$$;
