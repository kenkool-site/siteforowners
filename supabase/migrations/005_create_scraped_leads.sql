-- Scraped outbound leads from Google Maps and Instagram
CREATE TABLE IF NOT EXISTS scraped_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('google_maps', 'instagram')),
  source_id text NOT NULL,
  business_name text NOT NULL,
  owner_name text,
  business_type text,
  phone text,
  email text,
  address text,
  borough text NOT NULL CHECK (borough IN ('brooklyn', 'manhattan', 'queens', 'bronx', 'staten_island')),
  website text,
  website_type text DEFAULT 'none' CHECK (website_type IN ('none', 'booking_app', 'social', 'own_website')),
  instagram_handle text,
  instagram_followers int,
  google_maps_url text,
  rating numeric,
  review_count int,
  all_links text[],
  is_prospect boolean DEFAULT true,
  raw_data jsonb,
  dedup_status text DEFAULT 'unique' CHECK (dedup_status IN ('unique', 'auto_merged', 'flagged_review')),
  merged_into_id uuid REFERENCES scraped_leads(id),
  created_at timestamptz DEFAULT now(),
  scraped_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX idx_scraped_leads_source ON scraped_leads (source, source_id);
CREATE INDEX idx_scraped_leads_borough ON scraped_leads (borough);
CREATE INDEX idx_scraped_leads_is_prospect ON scraped_leads (is_prospect);
CREATE INDEX idx_scraped_leads_dedup_status ON scraped_leads (dedup_status);
CREATE INDEX idx_scraped_leads_phone ON scraped_leads (phone) WHERE phone IS NOT NULL;
