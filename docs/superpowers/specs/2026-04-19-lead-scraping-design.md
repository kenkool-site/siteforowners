# Lead Scraping & Import System Design

## Overview

A local Python CLI toolkit for scraping hair/beauty business leads from Google Maps and Instagram across all 5 NYC boroughs, with CSV output and a dedup-aware import into Supabase. Target: 1,000-2,000 leads.

## Target Audience

Hair/beauty businesses in NYC without a real website: salons, barbers, braiders, lash techs, nail techs. These are prospects for SiteForOwners.

## Data Model

New `scraped_leads` table in Supabase (separate from `interested_leads` which tracks inbound form submissions):

```sql
CREATE TABLE IF NOT EXISTS scraped_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('google_maps', 'instagram')),
  source_id text NOT NULL, -- Maps place_id or IG username
  business_name text NOT NULL,
  owner_name text,
  business_type text, -- 'hair_salon', 'barber', 'braider', 'lash_tech', 'nail_tech'
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
```

## Google Maps Scraper

### CLI

```
python scrape.py maps --borough queens --limit 200
python scrape.py maps --borough all --limit 1000
```

### Search Strategy

Each borough uses neighborhood-specific search queries. Key neighborhoods per borough:

| Borough | Neighborhoods |
|---------|--------------|
| Brooklyn | Flatbush, Bed-Stuy, Crown Heights, Williamsburg, Brownsville, East NY |
| Manhattan | Harlem, Washington Heights, East Village, LES, Midtown |
| Queens | Jamaica, Astoria, Flushing, Jackson Heights, Far Rockaway |
| Bronx | Fordham, Tremont, Mott Haven, Parkchester, Co-op City |
| Staten Island | St. George, New Dorp, Tottenville |

### Search Terms Per Neighborhood

- "hair salon {neighborhood}"
- "barber shop {neighborhood}"
- "African braiding salon {neighborhood}"
- "locs salon {neighborhood}"
- "natural hair stylist {neighborhood}"
- "lash technician {neighborhood}"
- "nail salon {neighborhood}"
- "Dominican salon {neighborhood}"
- Plus additional specialty terms as needed

### Method

- Playwright headless browser (no API key needed)
- 3-5 second random delay between searches
- Extracts: name, address, phone, website, social links, rating, review_count, place URL
- Classifies `website_type`: checks for Booksy/Vagaro/Square/Facebook/Instagram-only/none
- Deduplicates within the run by Maps place URL
- Based on existing `scrape_brooklyn_hair.py` patterns

### Output

CSV file per run: `output/maps_{borough}_{date}.csv`

## Instagram Scraper

### CLI

```
python scrape.py instagram --borough brooklyn --limit 200
python scrape.py instagram --borough all --limit 500
```

### Discovery Strategy

Hashtag-based search via Playwright on public Instagram pages:

**Hashtags per borough (~10-15 each):**
- `#{borough}hairstylist`, `#{borough}braider`, `#{borough}barber`
- `#nychairsalon`, `#nyclashes`, `#nycnailtech`
- `#{borough}hair`, `#{borough}braids`, `#{borough}locs`

### Profile Data Extraction

From each discovered profile, collect:
- Username / display name
- Bio text (often contains phone, email, booking link, neighborhood)
- Follower count
- External link (linktree, booking app, website)
- Contact/Book button presence
- Category label (e.g., "Hair Salon")

### Borough Classification

Since Instagram profiles lack structured addresses, classify from:
1. Bio text keywords ("BK", "BedStuy", "Harlem", "South Bronx", etc.)
2. Location tags on recent posts
3. Neighborhood hashtags used

### Prospect Filtering

- `is_prospect = true` if external link is null, linktree, or booking-only platform
- Skip profiles linking to a real business website
- Skip profiles with <100 followers (likely inactive/personal)

### Rate Limiting

- 5-8 second delays between page loads
- Limit to ~100-150 profiles per session
- Rotate user-agent strings
- Save progress for resume on block

### Output

CSV file per run: `output/instagram_{borough}_{date}.csv`

## Import Script & Dedup

### CLI

```
python scrape.py import --file maps_queens_2026-04-19.csv
python scrape.py import --file instagram_brooklyn_2026-04-19.csv
python scrape.py import --dir ./output
```

### Dedup Algorithm (3 passes)

**Pass 1 -- Exact source match (skip):**
- Check `source` + `source_id` against existing records
- Already exists = skip

**Pass 2 -- Auto-merge (phone or exact name + borough):**
- Normalize phone numbers (strip formatting, +1 prefix)
- Phone match or exact `business_name` + `borough` match triggers merge
- Keep richer record as primary, fill nulls from secondary
- Secondary gets `dedup_status = 'auto_merged'`, `merged_into_id` = primary ID

**Pass 3 -- Fuzzy flag (manual review):**
- Levenshtein distance on `business_name` within same borough (threshold: 80% similarity)
- Insert both records, newer one gets `dedup_status = 'flagged_review'`

### Import Summary

Prints to terminal:
```
Imported: 142 new leads
Skipped:   18 (already imported)
Merged:     8 (phone/name match)
Flagged:    4 (fuzzy match, needs review)
```

## Project Structure

```
web-project/
├── siteforowners/              # existing Next.js app
│   └── supabase/migrations/
│       └── 00X_create_scraped_leads.sql
├── scraper/
│   ├── scrape.py               # CLI entry point (argparse)
│   ├── scrapers/
│   │   ├── maps.py             # Google Maps scraper
│   │   ├── instagram.py        # Instagram profile scraper
│   │   └── config.py           # boroughs, neighborhoods, search terms, rate limits
│   ├── importer/
│   │   ├── import_leads.py     # CSV to Supabase with dedup
│   │   └── dedup.py            # dedup logic (exact, phone, fuzzy)
│   ├── output/                 # CSV output (gitignored)
│   ├── requirements.txt        # playwright, supabase-py, python-Levenshtein
│   └── .env                    # SUPABASE_URL, SUPABASE_SERVICE_KEY (gitignored)
├── brooklyn_hairstylists.csv   # existing scraped data
└── scrape_brooklyn_hair.py     # existing script (reference)
```

## Dependencies

- `playwright` -- headless browser for scraping
- `supabase` (supabase-py) -- database access for import
- `python-Levenshtein` -- fuzzy string matching for dedup
- No other frameworks needed

## Volume Estimates

- Google Maps: ~150-300 leads per borough (5 boroughs) = ~750-1,500
- Instagram: ~100-200 unique leads per borough (many will overlap with Maps) = ~300-600 net new
- After dedup: estimated 1,000-1,800 total unique leads
- Of those, ~50-60% expected to be prospects (no real website)

## Out of Scope

- No changes to the existing Next.js admin panel (query scraped_leads later)
- No scheduled/automated runs (manual CLI execution)
- No enrichment via Google Maps API or booking import (handled by existing API routes)
- No outreach automation (SMS/email campaigns)
