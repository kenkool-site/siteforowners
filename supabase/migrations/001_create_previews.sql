-- Preview data from AI onboarding wizard
-- No RLS needed — previews are public (shareable URLs)
CREATE TABLE IF NOT EXISTS previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  business_name text NOT NULL,
  business_type text NOT NULL,
  phone text,
  color_theme text NOT NULL,
  services jsonb NOT NULL DEFAULT '[]',
  hours jsonb,
  address text,
  images text[] DEFAULT '{}',
  generated_copy jsonb,
  template_variant text,
  view_count integer DEFAULT 0,
  converted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days')
);

CREATE INDEX idx_previews_slug ON previews (slug);
CREATE INDEX idx_previews_created_at ON previews (created_at DESC);
CREATE INDEX idx_previews_business_type ON previews (business_type);
