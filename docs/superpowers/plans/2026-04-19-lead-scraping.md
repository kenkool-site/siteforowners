# Lead Scraping & Import System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python CLI toolkit that scrapes hair/beauty business leads from Google Maps and Instagram across all 5 NYC boroughs, outputs CSV files, and imports them into Supabase with deduplication.

**Architecture:** A `scraper/` directory at the project root with a unified CLI entry point (`scrape.py`) using argparse subcommands (`maps`, `instagram`, `import`). Scrapers use Playwright for headless browser automation. Import writes to a new `scraped_leads` Supabase table with 3-pass dedup (exact source match, phone/name merge, fuzzy flag).

**Tech Stack:** Python 3.11+, Playwright, supabase-py, python-Levenshtein, argparse, csv

**Spec:** `docs/superpowers/specs/2026-04-19-lead-scraping-design.md`

---

## File Structure

```
web-project/
├── siteforowners/supabase/migrations/
│   └── 005_create_scraped_leads.sql        # New table migration
├── scraper/
│   ├── scrape.py                           # CLI entry point (argparse)
│   ├── scrapers/
│   │   ├── __init__.py
│   │   ├── config.py                       # Boroughs, neighborhoods, search terms, rate limits, booking platforms
│   │   ├── maps.py                         # Google Maps scraper (async Playwright)
│   │   └── instagram.py                    # Instagram profile scraper (async Playwright)
│   ├── importer/
│   │   ├── __init__.py
│   │   ├── dedup.py                        # Dedup logic (normalize phone, exact match, fuzzy match)
│   │   └── import_leads.py                 # CSV parsing + Supabase insert with dedup
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_config.py
│   │   ├── test_dedup.py
│   │   └── test_import.py
│   ├── output/                             # CSV output (gitignored)
│   │   └── .gitkeep
│   ├── requirements.txt
│   ├── .env.example                        # Template for SUPABASE_URL, SUPABASE_SERVICE_KEY
│   └── .gitignore                          # output/*.csv, .env
```

---

## Task 1: Supabase Migration — `scraped_leads` Table

**Files:**
- Create: `siteforowners/supabase/migrations/005_create_scraped_leads.sql`

- [ ] **Step 1: Write the migration SQL**

Create `siteforowners/supabase/migrations/005_create_scraped_leads.sql`:

```sql
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/aws/Downloads/web-project/siteforowners
git add supabase/migrations/005_create_scraped_leads.sql
git commit -m "feat: add scraped_leads migration for outbound lead scraping"
```

---

## Task 2: Scraper Config — Boroughs, Neighborhoods, Search Terms

**Files:**
- Create: `scraper/scrapers/__init__.py`
- Create: `scraper/scrapers/config.py`
- Create: `scraper/tests/__init__.py`
- Create: `scraper/tests/test_config.py`

- [ ] **Step 1: Create directory structure and __init__ files**

Create `scraper/scrapers/__init__.py` (empty file).
Create `scraper/importer/__init__.py` (empty file).
Create `scraper/tests/__init__.py` (empty file).

- [ ] **Step 2: Write test for config**

Create `scraper/tests/test_config.py`:

```python
from scrapers.config import (
    BOROUGHS,
    NEIGHBORHOODS,
    MAPS_SEARCH_TEMPLATES,
    INSTAGRAM_HASHTAG_TEMPLATES,
    BOOKING_PLATFORMS,
    get_maps_queries,
    get_instagram_hashtags,
)


def test_all_boroughs_have_neighborhoods():
    for borough in BOROUGHS:
        assert borough in NEIGHBORHOODS, f"Missing neighborhoods for {borough}"
        assert len(NEIGHBORHOODS[borough]) >= 3, f"Too few neighborhoods for {borough}"


def test_get_maps_queries_single_borough():
    queries = get_maps_queries("brooklyn")
    assert len(queries) > 0
    assert all("Brooklyn" in q or "brooklyn" in q.lower() for q in queries)


def test_get_maps_queries_all():
    queries = get_maps_queries("all")
    # Should have queries for all 5 boroughs
    assert len(queries) > len(get_maps_queries("brooklyn"))


def test_get_instagram_hashtags_single_borough():
    tags = get_instagram_hashtags("brooklyn")
    assert len(tags) > 0
    assert all("brooklyn" in t.lower() or "nyc" in t.lower() for t in tags)


def test_get_instagram_hashtags_all():
    tags = get_instagram_hashtags("all")
    assert len(tags) > len(get_instagram_hashtags("brooklyn"))


def test_booking_platforms_has_known_entries():
    assert "booksy.com" in BOOKING_PLATFORMS
    assert "vagaro.com" in BOOKING_PLATFORMS
    assert "instagram.com" in BOOKING_PLATFORMS


def test_borough_validation():
    assert "brooklyn" in BOROUGHS
    assert "manhattan" in BOROUGHS
    assert "queens" in BOROUGHS
    assert "bronx" in BOROUGHS
    assert "staten_island" in BOROUGHS
    assert len(BOROUGHS) == 5
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/aws/Downloads/web-project/scraper
python -m pytest tests/test_config.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'scrapers.config'`

- [ ] **Step 4: Write config.py**

Create `scraper/scrapers/config.py`:

```python
"""
Boroughs, neighborhoods, search terms, and constants for NYC hair/beauty lead scraping.
"""

BOROUGHS = ["brooklyn", "manhattan", "queens", "bronx", "staten_island"]

NEIGHBORHOODS = {
    "brooklyn": [
        "Flatbush", "Bed-Stuy", "Crown Heights", "Williamsburg",
        "Brownsville", "East New York", "Bushwick", "Canarsie",
        "East Flatbush", "Bay Ridge",
    ],
    "manhattan": [
        "Harlem", "Washington Heights", "East Village",
        "Lower East Side", "Midtown", "Inwood", "East Harlem",
    ],
    "queens": [
        "Jamaica", "Astoria", "Flushing", "Jackson Heights",
        "Far Rockaway", "South Ozone Park", "Corona",
    ],
    "bronx": [
        "Fordham", "Tremont", "Mott Haven", "Parkchester",
        "Co-op City", "Castle Hill", "Morrisania",
    ],
    "staten_island": [
        "St. George", "New Dorp", "Tottenville",
        "Port Richmond", "Stapleton",
    ],
}

# Borough display names for search queries
BOROUGH_DISPLAY = {
    "brooklyn": "Brooklyn",
    "manhattan": "Manhattan",
    "queens": "Queens",
    "bronx": "Bronx",
    "staten_island": "Staten Island",
}

MAPS_SEARCH_TEMPLATES = [
    "hair salon {neighborhood} {borough_display} NY",
    "barber shop {neighborhood} {borough_display} NY",
    "African braiding salon {neighborhood} {borough_display} NY",
    "locs salon {neighborhood} {borough_display} NY",
    "natural hair stylist {neighborhood} {borough_display} NY",
    "lash technician {neighborhood} {borough_display} NY",
    "nail salon {neighborhood} {borough_display} NY",
    "Dominican salon {neighborhood} {borough_display} NY",
    "hair braids {neighborhood} {borough_display} NY",
]

INSTAGRAM_HASHTAG_TEMPLATES = [
    "#{borough_lower}hairstylist",
    "#{borough_lower}braider",
    "#{borough_lower}barber",
    "#{borough_lower}hair",
    "#{borough_lower}braids",
    "#{borough_lower}locs",
    "#{borough_lower}nails",
    "#{borough_lower}lashes",
    "#nychairsalon",
    "#nyclashes",
    "#nycnailtech",
    "#nycbraider",
    "#nycbarber",
]

# Instagram hashtags that use the borough name without underscores
BOROUGH_HASHTAG_NAMES = {
    "brooklyn": "brooklyn",
    "manhattan": "manhattan",
    "queens": "queens",
    "bronx": "bronx",
    "staten_island": "statenisland",
}

BOOKING_PLATFORMS = [
    "booksy.com", "vagaro.com", "styleseat.com", "squareup.com",
    "square.com", "fresha.com", "schedulicity.com", "facebook.com",
    "instagram.com", "linktree.com", "linktr.ee", "yelp.com",
    "calendly.com", "acuityscheduling.com", "glambook.com",
]

# Borough classification keywords for Instagram bio parsing
BOROUGH_BIO_KEYWORDS = {
    "brooklyn": ["brooklyn", "bk", "bklyn", "bed-stuy", "bedstuy", "flatbush",
                 "crown heights", "williamsburg", "bushwick", "brownsville",
                 "east new york", "canarsie", "bay ridge", "east flatbush"],
    "manhattan": ["manhattan", "harlem", "washington heights", "east village",
                  "lower east side", "les", "midtown", "inwood", "east harlem",
                  "uptown", "downtown"],
    "queens": ["queens", "jamaica", "astoria", "flushing", "jackson heights",
               "far rockaway", "corona", "south ozone park"],
    "bronx": ["bronx", "bx", "fordham", "tremont", "mott haven",
              "parkchester", "co-op city", "castle hill", "morrisania",
              "south bronx"],
    "staten_island": ["staten island", "si", "st. george", "new dorp",
                      "tottenville", "port richmond", "stapleton"],
}

# Rate limiting
MAPS_DELAY_MIN = 3.0
MAPS_DELAY_MAX = 5.0
INSTAGRAM_DELAY_MIN = 5.0
INSTAGRAM_DELAY_MAX = 8.0
INSTAGRAM_SESSION_LIMIT = 150

# Minimum followers to consider an Instagram profile a real business
INSTAGRAM_MIN_FOLLOWERS = 100

# CSV columns matching scraped_leads schema
CSV_COLUMNS = [
    "source", "source_id", "business_name", "owner_name", "business_type",
    "phone", "email", "address", "borough", "website", "website_type",
    "instagram_handle", "instagram_followers", "google_maps_url",
    "rating", "review_count", "all_links", "is_prospect", "raw_data",
    "scraped_at",
]


def get_maps_queries(borough: str) -> list[str]:
    """Generate all Google Maps search queries for a borough (or 'all')."""
    boroughs = BOROUGHS if borough == "all" else [borough]
    queries = []
    for b in boroughs:
        display = BOROUGH_DISPLAY[b]
        for neighborhood in NEIGHBORHOODS[b]:
            for template in MAPS_SEARCH_TEMPLATES:
                queries.append(
                    template.format(
                        neighborhood=neighborhood,
                        borough_display=display,
                    )
                )
    return queries


def get_instagram_hashtags(borough: str) -> list[str]:
    """Generate Instagram hashtags for a borough (or 'all'). Deduped."""
    boroughs = BOROUGHS if borough == "all" else [borough]
    seen = set()
    tags = []
    for b in boroughs:
        hashtag_name = BOROUGH_HASHTAG_NAMES[b]
        for template in INSTAGRAM_HASHTAG_TEMPLATES:
            tag = template.format(borough_lower=hashtag_name)
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
    return tags
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/aws/Downloads/web-project/scraper
python -m pytest tests/test_config.py -v
```

Expected: All 7 tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/aws/Downloads/web-project/scraper
git add scrapers/__init__.py scrapers/config.py importer/__init__.py tests/__init__.py tests/test_config.py
git commit -m "feat: add scraper config with boroughs, neighborhoods, and search terms"
```

---

## Task 3: Dedup Module

**Files:**
- Create: `scraper/importer/dedup.py`
- Create: `scraper/tests/test_dedup.py`

- [ ] **Step 1: Write dedup tests**

Create `scraper/tests/test_dedup.py`:

```python
import pytest
from importer.dedup import normalize_phone, is_phone_match, is_fuzzy_name_match


class TestNormalizePhone:
    def test_formatted_phone(self):
        assert normalize_phone("(718) 773-7322") == "7187737322"

    def test_with_country_code(self):
        assert normalize_phone("+1 718-773-7322") == "7187737322"

    def test_dots(self):
        assert normalize_phone("718.773.7322") == "7187737322"

    def test_raw_digits(self):
        assert normalize_phone("7187737322") == "7187737322"

    def test_eleven_digits_with_1(self):
        assert normalize_phone("17187737322") == "7187737322"

    def test_empty(self):
        assert normalize_phone("") == ""

    def test_none(self):
        assert normalize_phone(None) == ""


class TestIsPhoneMatch:
    def test_same_phone_different_format(self):
        assert is_phone_match("(718) 773-7322", "+1-718-773-7322") is True

    def test_different_phones(self):
        assert is_phone_match("(718) 773-7322", "(212) 555-1234") is False

    def test_one_empty(self):
        assert is_phone_match("(718) 773-7322", "") is False

    def test_both_empty(self):
        assert is_phone_match("", "") is False

    def test_both_none(self):
        assert is_phone_match(None, None) is False


class TestIsFuzzyNameMatch:
    def test_exact_match(self):
        assert is_fuzzy_name_match("Loc'd Up Hair Studio", "Loc'd Up Hair Studio") is True

    def test_minor_variation(self):
        assert is_fuzzy_name_match("Loc'd Up Hair Studio", "Locd Up Studio") is True

    def test_completely_different(self):
        assert is_fuzzy_name_match("Loc'd Up Hair Studio", "Brooklyn Barber Shop") is False

    def test_case_insensitive(self):
        assert is_fuzzy_name_match("AMY'S BRAIDING", "Amy's Braiding") is True

    def test_empty_strings(self):
        assert is_fuzzy_name_match("", "") is False

    def test_short_similar_names(self):
        # Short names that are similar but distinct businesses
        assert is_fuzzy_name_match("Salon A", "Salon B") is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/aws/Downloads/web-project/scraper
python -m pytest tests/test_dedup.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'importer.dedup'`

- [ ] **Step 3: Write dedup.py**

Create `scraper/importer/dedup.py`:

```python
"""
Deduplication logic for scraped leads.
- Phone normalization and matching
- Fuzzy business name matching via Levenshtein distance
"""

import re
from Levenshtein import ratio as levenshtein_ratio

FUZZY_THRESHOLD = 0.80


def normalize_phone(phone: str | None) -> str:
    """Strip a phone string to 10 digits. Returns empty string if invalid."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("1") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10:
        return digits
    return ""


def is_phone_match(phone_a: str | None, phone_b: str | None) -> bool:
    """Check if two phone strings are the same number."""
    a = normalize_phone(phone_a)
    b = normalize_phone(phone_b)
    if not a or not b:
        return False
    return a == b


def is_fuzzy_name_match(name_a: str, name_b: str) -> bool:
    """Check if two business names are similar enough to flag for review.
    Uses Levenshtein ratio with 80% threshold. Case-insensitive.
    Returns False for empty strings.
    """
    if not name_a or not name_b:
        return False
    a = name_a.strip().lower()
    b = name_b.strip().lower()
    if a == b:
        return True
    return levenshtein_ratio(a, b) >= FUZZY_THRESHOLD
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/aws/Downloads/web-project/scraper
python -m pytest tests/test_dedup.py -v
```

Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/aws/Downloads/web-project/scraper
git add importer/dedup.py tests/test_dedup.py
git commit -m "feat: add dedup module with phone normalization and fuzzy name matching"
```

---

## Task 4: Import Script — CSV to Supabase with Dedup

**Files:**
- Create: `scraper/importer/import_leads.py`
- Create: `scraper/tests/test_import.py`
- Create: `scraper/.env.example`

- [ ] **Step 1: Write import tests**

Create `scraper/tests/test_import.py`:

```python
import csv
import io
import pytest
from importer.import_leads import parse_csv_row, merge_records


def make_row(**overrides):
    """Create a default CSV row dict with overrides."""
    defaults = {
        "source": "google_maps",
        "source_id": "ChIJ_test123",
        "business_name": "Test Salon",
        "owner_name": "",
        "business_type": "hair_salon",
        "phone": "(718) 555-1234",
        "email": "test@salon.com",
        "address": "123 Main St, Brooklyn, NY",
        "borough": "brooklyn",
        "website": "",
        "website_type": "none",
        "instagram_handle": "",
        "instagram_followers": "",
        "google_maps_url": "https://maps.google.com/test",
        "rating": "4.5",
        "review_count": "100",
        "all_links": "https://booksy.com/test | https://instagram.com/test",
        "is_prospect": "true",
        "raw_data": "{}",
        "scraped_at": "2026-04-19T12:00:00Z",
    }
    defaults.update(overrides)
    return defaults


class TestParseCsvRow:
    def test_basic_parse(self):
        row = make_row()
        result = parse_csv_row(row)
        assert result["business_name"] == "Test Salon"
        assert result["borough"] == "brooklyn"
        assert result["source"] == "google_maps"
        assert result["is_prospect"] is True

    def test_all_links_parsed_as_list(self):
        row = make_row(all_links="https://a.com | https://b.com")
        result = parse_csv_row(row)
        assert result["all_links"] == ["https://a.com", "https://b.com"]

    def test_empty_all_links(self):
        row = make_row(all_links="")
        result = parse_csv_row(row)
        assert result["all_links"] == []

    def test_numeric_fields_parsed(self):
        row = make_row(rating="4.8", review_count="250", instagram_followers="5000")
        result = parse_csv_row(row)
        assert result["rating"] == 4.8
        assert result["review_count"] == 250
        assert result["instagram_followers"] == 5000

    def test_empty_numeric_fields_become_none(self):
        row = make_row(rating="", review_count="", instagram_followers="")
        result = parse_csv_row(row)
        assert result["rating"] is None
        assert result["review_count"] is None
        assert result["instagram_followers"] is None

    def test_is_prospect_boolean(self):
        assert parse_csv_row(make_row(is_prospect="true"))["is_prospect"] is True
        assert parse_csv_row(make_row(is_prospect="YES"))["is_prospect"] is True
        assert parse_csv_row(make_row(is_prospect="false"))["is_prospect"] is False
        assert parse_csv_row(make_row(is_prospect="no"))["is_prospect"] is False


class TestMergeRecords:
    def test_fills_missing_fields(self):
        primary = {"phone": "(718) 555-1234", "email": "", "instagram_handle": ""}
        secondary = {"phone": "", "email": "test@salon.com", "instagram_handle": "@testsalon"}
        merged = merge_records(primary, secondary)
        assert merged["phone"] == "(718) 555-1234"
        assert merged["email"] == "test@salon.com"
        assert merged["instagram_handle"] == "@testsalon"

    def test_primary_values_preserved(self):
        primary = {"phone": "(718) 555-1234", "email": "primary@test.com"}
        secondary = {"phone": "(212) 999-8888", "email": "secondary@test.com"}
        merged = merge_records(primary, secondary)
        assert merged["phone"] == "(718) 555-1234"
        assert merged["email"] == "primary@test.com"

    def test_higher_rating_wins(self):
        primary = {"rating": 4.2, "review_count": 50}
        secondary = {"rating": 4.8, "review_count": 200}
        merged = merge_records(primary, secondary)
        assert merged["rating"] == 4.8
        assert merged["review_count"] == 200

    def test_none_rating_filled(self):
        primary = {"rating": None, "review_count": None}
        secondary = {"rating": 4.5, "review_count": 100}
        merged = merge_records(primary, secondary)
        assert merged["rating"] == 4.5
        assert merged["review_count"] == 100
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/aws/Downloads/web-project/scraper
python -m pytest tests/test_import.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'importer.import_leads'`

- [ ] **Step 3: Write import_leads.py**

Create `scraper/importer/import_leads.py`:

```python
"""
CSV import into Supabase scraped_leads table with 3-pass dedup.

Usage:
    from importer.import_leads import import_csv
    stats = import_csv("output/maps_brooklyn_2026-04-19.csv", supabase_client)
"""

import csv
import json
import os
from supabase import create_client
from dotenv import load_dotenv
from importer.dedup import normalize_phone, is_phone_match, is_fuzzy_name_match


def get_supabase_client():
    """Create Supabase admin client from .env."""
    load_dotenv()
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def parse_csv_row(row: dict) -> dict:
    """Parse a CSV row dict into a scraped_leads-compatible dict."""
    # Parse all_links from pipe-separated string to list
    all_links_raw = row.get("all_links", "").strip()
    all_links = [link.strip() for link in all_links_raw.split(" | ") if link.strip()] if all_links_raw else []

    # Parse numeric fields
    def parse_float(val):
        try:
            return float(val) if val else None
        except (ValueError, TypeError):
            return None

    def parse_int(val):
        try:
            return int(val) if val else None
        except (ValueError, TypeError):
            return None

    # Parse boolean
    is_prospect_raw = row.get("is_prospect", "true").strip().lower()
    is_prospect = is_prospect_raw in ("true", "yes", "1")

    # Parse raw_data JSON
    raw_data_str = row.get("raw_data", "{}").strip()
    try:
        raw_data = json.loads(raw_data_str) if raw_data_str else {}
    except json.JSONDecodeError:
        raw_data = {}

    return {
        "source": row.get("source", "").strip(),
        "source_id": row.get("source_id", "").strip(),
        "business_name": row.get("business_name", "").strip(),
        "owner_name": row.get("owner_name", "").strip() or None,
        "business_type": row.get("business_type", "").strip() or None,
        "phone": row.get("phone", "").strip() or None,
        "email": row.get("email", "").strip() or None,
        "address": row.get("address", "").strip() or None,
        "borough": row.get("borough", "").strip(),
        "website": row.get("website", "").strip() or None,
        "website_type": row.get("website_type", "none").strip(),
        "instagram_handle": row.get("instagram_handle", "").strip() or None,
        "instagram_followers": parse_int(row.get("instagram_followers", "")),
        "google_maps_url": row.get("google_maps_url", "").strip() or None,
        "rating": parse_float(row.get("rating", "")),
        "review_count": parse_int(row.get("review_count", "")),
        "all_links": all_links,
        "is_prospect": is_prospect,
        "raw_data": raw_data,
        "scraped_at": row.get("scraped_at", "").strip(),
    }


def merge_records(primary: dict, secondary: dict) -> dict:
    """Merge two lead records. Primary wins for non-empty fields,
    except: higher rating+review_count wins."""
    merged = dict(primary)

    # Fill missing string/list fields from secondary
    fill_fields = [
        "owner_name", "phone", "email", "address", "website",
        "instagram_handle", "google_maps_url", "business_type",
    ]
    for field in fill_fields:
        if not merged.get(field) and secondary.get(field):
            merged[field] = secondary[field]

    # Fill missing numeric fields
    if merged.get("instagram_followers") is None and secondary.get("instagram_followers") is not None:
        merged["instagram_followers"] = secondary["instagram_followers"]

    # Higher rating wins (with its review_count)
    primary_rating = merged.get("rating")
    secondary_rating = secondary.get("rating")
    if primary_rating is None and secondary_rating is not None:
        merged["rating"] = secondary_rating
        merged["review_count"] = secondary.get("review_count")
    elif primary_rating is not None and secondary_rating is not None:
        if secondary_rating > primary_rating:
            merged["rating"] = secondary_rating
            merged["review_count"] = secondary.get("review_count")

    return merged


def import_csv(filepath: str, supabase_client=None) -> dict:
    """Import a CSV file into scraped_leads with 3-pass dedup.

    Returns stats dict: {imported, skipped, merged, flagged}
    """
    client = supabase_client or get_supabase_client()
    stats = {"imported": 0, "skipped": 0, "merged": 0, "flagged": 0}

    # Read CSV
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [parse_csv_row(row) for row in reader]

    for row in rows:
        source = row["source"]
        source_id = row["source_id"]

        if not source or not source_id or not row["business_name"]:
            continue

        # Pass 1: Exact source match — skip if already imported
        existing = (
            client.table("scraped_leads")
            .select("id")
            .eq("source", source)
            .eq("source_id", source_id)
            .execute()
        )
        if existing.data:
            stats["skipped"] += 1
            continue

        # Pass 2: Auto-merge on phone or exact name + borough
        merge_target = None

        # Check phone match
        if row["phone"]:
            normalized = normalize_phone(row["phone"])
            if normalized:
                phone_matches = (
                    client.table("scraped_leads")
                    .select("*")
                    .eq("borough", row["borough"])
                    .not_.is_("phone", "null")
                    .execute()
                )
                for existing_row in phone_matches.data:
                    if is_phone_match(row["phone"], existing_row["phone"]):
                        merge_target = existing_row
                        break

        # Check exact name + borough match
        if not merge_target:
            name_matches = (
                client.table("scraped_leads")
                .select("*")
                .eq("borough", row["borough"])
                .eq("business_name", row["business_name"])
                .execute()
            )
            if name_matches.data:
                merge_target = name_matches.data[0]

        if merge_target:
            # Merge into existing record
            merged = merge_records(merge_target, row)
            client.table("scraped_leads").update(merged).eq("id", merge_target["id"]).execute()

            # Insert the secondary with merged status
            row["dedup_status"] = "auto_merged"
            row["merged_into_id"] = merge_target["id"]
            client.table("scraped_leads").insert(row).execute()
            stats["merged"] += 1
            continue

        # Pass 3: Fuzzy name match — flag for review
        fuzzy_flagged = False
        borough_leads = (
            client.table("scraped_leads")
            .select("id, business_name")
            .eq("borough", row["borough"])
            .eq("dedup_status", "unique")
            .execute()
        )
        for existing_row in borough_leads.data:
            if is_fuzzy_name_match(row["business_name"], existing_row["business_name"]):
                row["dedup_status"] = "flagged_review"
                client.table("scraped_leads").insert(row).execute()
                stats["flagged"] += 1
                fuzzy_flagged = True
                break

        if not fuzzy_flagged:
            # Clean insert
            row["dedup_status"] = "unique"
            client.table("scraped_leads").insert(row).execute()
            stats["imported"] += 1

    return stats


def import_directory(dirpath: str, supabase_client=None) -> dict:
    """Import all CSV files in a directory. Returns combined stats."""
    import glob
    total_stats = {"imported": 0, "skipped": 0, "merged": 0, "flagged": 0}
    csv_files = sorted(glob.glob(os.path.join(dirpath, "*.csv")))

    for filepath in csv_files:
        print(f"\nImporting {os.path.basename(filepath)}...")
        stats = import_csv(filepath, supabase_client)
        for key in total_stats:
            total_stats[key] += stats[key]
        print(f"  Imported: {stats['imported']}  Skipped: {stats['skipped']}  "
              f"Merged: {stats['merged']}  Flagged: {stats['flagged']}")

    return total_stats
```

- [ ] **Step 4: Create .env.example**

Create `scraper/.env.example`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/aws/Downloads/web-project/scraper
pip install python-dotenv
python -m pytest tests/test_import.py -v
```

Expected: All 10 tests PASS (these tests don't hit Supabase -- they test pure parsing/merge logic)

- [ ] **Step 6: Commit**

```bash
cd /Users/aws/Downloads/web-project/scraper
git add importer/import_leads.py tests/test_import.py .env.example
git commit -m "feat: add CSV import with 3-pass dedup (exact, phone/name, fuzzy)"
```

---

## Task 5: Google Maps Scraper

**Files:**
- Create: `scraper/scrapers/maps.py`

- [ ] **Step 1: Write maps.py**

This is an async Playwright scraper — integration testing requires a browser, so we rely on the proven patterns from the existing `scrape_brooklyn_hair.py` and test manually.

Create `scraper/scrapers/maps.py`:

```python
"""
Google Maps scraper for hair/beauty businesses.
Uses Playwright (headless browser) — no API key needed.

Based on the proven scrape_brooklyn_hair.py patterns.
"""

import asyncio
import csv
import json
import os
import random
import re
from datetime import datetime, timezone
from playwright.async_api import async_playwright

from scrapers.config import (
    BOOKING_PLATFORMS,
    BOROUGH_DISPLAY,
    CSV_COLUMNS,
    MAPS_DELAY_MIN,
    MAPS_DELAY_MAX,
    get_maps_queries,
)


def format_phone(raw: str) -> str:
    """Clean a raw phone string into (xxx) xxx-xxxx format."""
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("1") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return raw


def classify_website(url: str) -> str:
    """Classify a website URL as none/booking_app/social/own_website."""
    if not url:
        return "none"
    u = url.lower()
    for p in BOOKING_PLATFORMS:
        if p in u:
            if "facebook" in u or "instagram" in u:
                return "social"
            return "booking_app"
    return "own_website"


def extract_instagram_handle(all_links: list[str]) -> str | None:
    """Pull Instagram handle from a list of URLs."""
    for link in all_links:
        if "instagram.com" in link.lower():
            match = re.search(r"instagram\.com/([A-Za-z0-9_.]+)", link)
            if match:
                handle = match.group(1)
                if handle not in ("p", "explore", "reel", "stories"):
                    return handle
    return None


async def scroll_and_collect_cards(page):
    """Scroll the Google Maps results panel and return (name, href) tuples."""
    panel_sel = '[role="feed"]'
    try:
        panel = page.locator(panel_sel)
        for _ in range(10):
            await panel.evaluate("el => el.scrollBy(0, 900)")
            await page.wait_for_timeout(1000)
    except Exception:
        pass
    cards = await page.locator('a[href*="/maps/place/"]').all()
    results = []
    for card in cards:
        name = (await card.get_attribute("aria-label") or "").strip()
        href = (await card.get_attribute("href") or "").strip()
        if name and href:
            results.append((name, href))
    return results


async def extract_detail(page, name: str, href: str) -> dict | None:
    """Navigate to a place URL and scrape business details."""
    try:
        await page.goto(href, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(2800)

        # Phone
        phone = ""
        for sel in [
            'button[data-tooltip="Copy phone number"]',
            'button[aria-label*="Phone"]',
            'a[data-tooltip="Call phone number"]',
            'button[data-item-id^="phone:"]',
            'a[href^="tel:"]',
        ]:
            el = page.locator(sel)
            if await el.count() > 0:
                el_href = await el.first.get_attribute("href") or ""
                if el_href.startswith("tel:"):
                    phone = re.sub(r"^tel:\+?1?", "", el_href).strip()
                    break
                raw = await el.first.get_attribute("data-item-id") or ""
                if raw.startswith("phone:"):
                    phone = re.sub(r"^phone:tel:\+?1?", "", raw).strip()
                    break
                aria = await el.first.get_attribute("aria-label") or ""
                m = re.search(r"\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}", aria)
                if m:
                    phone = m.group().strip()
                    break
        if not phone:
            body = await page.locator("body").inner_text()
            m = re.search(r"\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}", body)
            if m:
                phone = m.group().strip()

        # Website
        website = ""
        for sel in [
            'a[data-tooltip="Open website"]',
            'a[aria-label*="Website"]',
            'a[data-item-id="authority"]',
            'a[data-tooltip="Open menu link"]',
        ]:
            el = page.locator(sel)
            if await el.count() > 0:
                website = (await el.first.get_attribute("href") or "").strip()
                if website:
                    break

        # All links
        all_links = set()
        if website:
            all_links.add(website)
        for sel in [
            'a[data-tooltip="Open services link"]',
            'a[data-tooltip="Open menu link"]',
            'a[data-tooltip="Open website"]',
            'a[data-item-id="authority"]',
            'a[data-item-id="services"]',
        ]:
            els = await page.locator(sel).all()
            for a in els:
                link = (await a.get_attribute("href") or "").strip()
                if link and "support.google.com" not in link:
                    all_links.add(link)
        for a_el in await page.locator("a[href]").all():
            try:
                h = (await a_el.get_attribute("href") or "").strip()
                if any(p in h.lower() for p in [
                    "facebook.com", "instagram.com", "booksy.com", "vagaro.com",
                    "styleseat.com", "yelp.com", "fresha.com", "linktree.com",
                    "linktr.ee", "square.site", "squareup.com",
                ]):
                    all_links.add(h)
            except Exception:
                pass
        all_links = {l for l in all_links if "google.com" not in l}

        # Email
        email = ""
        body_text = await page.locator("body").inner_text()
        email_matches = re.findall(
            r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", body_text
        )
        email_matches = [
            e for e in email_matches
            if not any(x in e.lower() for x in ["google", "gstatic", "example"])
        ]
        if email_matches:
            email = email_matches[0]

        # Address
        address = ""
        for sel in [
            'button[data-tooltip="Copy address"]',
            'button[data-item-id="address"]',
            'button[aria-label*="Address"]',
        ]:
            el = page.locator(sel)
            if await el.count() > 0:
                raw = await el.first.get_attribute("aria-label") or ""
                address = re.sub(r"^(Copy )?[Aa]ddress:?\s*", "", raw).strip()
                if address:
                    break

        # Rating
        rating = ""
        for sel in ['span[aria-label*="stars"]', 'span[aria-label*="star"]', 'div[aria-label*="stars"]']:
            el = page.locator(sel).first
            if await el.count() > 0:
                aria = await el.get_attribute("aria-label") or ""
                m = re.search(r"([\d\.]+)\s+star", aria)
                if m:
                    rating = m.group(1)
                    break

        # Review count
        reviews = ""
        for sel in ['span[aria-label*="review"]', 'button[aria-label*="review"]']:
            el = page.locator(sel).first
            if await el.count() > 0:
                aria = await el.get_attribute("aria-label") or ""
                m = re.search(r"([\d,]+)\s+review", aria)
                if m:
                    reviews = m.group(1).replace(",", "")
                    break

        if phone:
            phone = format_phone(phone)

        web_type = classify_website(website)
        is_prospect = web_type in ("none", "booking_app", "social")

        # Extract place ID from href for source_id
        place_id_match = re.search(r"place/[^/]+/([^/]+)", href)
        source_id = place_id_match.group(1) if place_id_match else href

        all_links_list = sorted(all_links)
        instagram_handle = extract_instagram_handle(all_links_list)

        return {
            "source": "google_maps",
            "source_id": source_id,
            "business_name": name,
            "owner_name": "",
            "business_type": "",
            "phone": phone,
            "email": email,
            "address": address,
            "website": website,
            "website_type": web_type,
            "instagram_handle": instagram_handle or "",
            "instagram_followers": "",
            "google_maps_url": href,
            "rating": rating,
            "review_count": reviews,
            "all_links": " | ".join(all_links_list),
            "is_prospect": "true" if is_prospect else "false",
            "raw_data": json.dumps({"href": href, "all_links": all_links_list}),
        }

    except Exception as e:
        print(f"    Error extracting '{name}': {e}")
        return None


async def scrape_maps(borough: str, limit: int = 200) -> str:
    """Scrape Google Maps for hair/beauty leads in a borough.

    Args:
        borough: Borough name or 'all'
        limit: Max leads to collect

    Returns:
        Path to output CSV file
    """
    queries = get_maps_queries(borough)
    all_rows = []
    seen_names = set()
    scraped_at = datetime.now(timezone.utc).isoformat()

    print(f"\nGoogle Maps scraper — {borough}")
    print(f"Queries: {len(queries)}, Target: {limit}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            slow_mo=50,
        )
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = await ctx.new_page()

        for query in queries:
            if len(all_rows) >= limit:
                break

            print(f"\n  {query}")
            url = "https://www.google.com/maps/search/" + query.replace(" ", "+")
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=40000)
                await page.wait_for_timeout(3000)

                cards = await scroll_and_collect_cards(page)
                print(f"    {len(cards)} cards loaded")

                for name, href in cards:
                    if len(all_rows) >= limit:
                        break
                    if name in seen_names:
                        continue
                    seen_names.add(name)

                    row = await extract_detail(page, name, href)
                    if row:
                        row["scraped_at"] = scraped_at
                        # Determine borough from the query
                        row["borough"] = borough if borough != "all" else _detect_borough_from_address(row["address"])
                        icon = "Y" if row["is_prospect"] == "true" else " "
                        print(f"    [{icon}] {row['business_name'][:40]:<40} | {row['website_type']:<12} | {row['phone'] or '—'}")
                        all_rows.append(row)
                    await page.wait_for_timeout(200)

            except Exception as e:
                print(f"    Error on query: {e}")

            delay = random.uniform(MAPS_DELAY_MIN, MAPS_DELAY_MAX)
            await page.wait_for_timeout(int(delay * 1000))

        await browser.close()

    # Sort: prospects first
    all_rows.sort(key=lambda r: (r["is_prospect"] != "true", r["business_name"].lower()))
    all_rows = all_rows[:limit]

    # Write CSV
    date_str = datetime.now().strftime("%Y-%m-%d")
    borough_label = borough if borough != "all" else "all"
    os.makedirs("output", exist_ok=True)
    output_path = f"output/maps_{borough_label}_{date_str}.csv"

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(all_rows)

    # Summary
    total = len(all_rows)
    prospects = sum(1 for r in all_rows if r["is_prospect"] == "true")
    with_phone = sum(1 for r in all_rows if r["phone"])
    print(f"\nDone! {output_path}")
    print(f"  Total: {total}  Prospects: {prospects}  With phone: {with_phone}")

    return output_path


def _detect_borough_from_address(address: str) -> str:
    """Best-effort borough detection from a street address."""
    if not address:
        return "brooklyn"  # fallback
    a = address.lower()
    if "brooklyn" in a:
        return "brooklyn"
    if "manhattan" in a or "new york, ny 100" in a:
        return "manhattan"
    if "queens" in a:
        return "queens"
    if "bronx" in a:
        return "bronx"
    if "staten island" in a:
        return "staten_island"
    return "brooklyn"
```

- [ ] **Step 2: Smoke test manually**

```bash
cd /Users/aws/Downloads/web-project/scraper
python -c "from scrapers.maps import classify_website, format_phone, extract_instagram_handle; \
print(classify_website('https://booksy.com/test')); \
print(format_phone('7185551234')); \
print(extract_instagram_handle(['https://instagram.com/testsalon']))"
```

Expected output:
```
booking_app
(718) 555-1234
testsalon
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aws/Downloads/web-project/scraper
git add scrapers/maps.py
git commit -m "feat: add Google Maps scraper for all NYC boroughs"
```

---

## Task 6: Instagram Scraper

**Files:**
- Create: `scraper/scrapers/instagram.py`

- [ ] **Step 1: Write instagram.py**

Create `scraper/scrapers/instagram.py`:

```python
"""
Instagram scraper for hair/beauty professionals.
Uses Playwright to browse public hashtag pages and profiles.
Targets beauty pros who operate primarily through Instagram (no website).
"""

import asyncio
import csv
import json
import os
import random
import re
from datetime import datetime, timezone
from playwright.async_api import async_playwright

from scrapers.config import (
    BOOKING_PLATFORMS,
    BOROUGH_BIO_KEYWORDS,
    CSV_COLUMNS,
    INSTAGRAM_DELAY_MIN,
    INSTAGRAM_DELAY_MAX,
    INSTAGRAM_MIN_FOLLOWERS,
    INSTAGRAM_SESSION_LIMIT,
    get_instagram_hashtags,
)

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]


def classify_external_link(url: str) -> str:
    """Classify an Instagram profile's external link."""
    if not url:
        return "none"
    u = url.lower()
    for p in BOOKING_PLATFORMS:
        if p in u:
            if "facebook.com" in u or "instagram.com" in u:
                return "social"
            return "booking_app"
    return "own_website"


def detect_borough_from_bio(bio: str) -> str | None:
    """Detect NYC borough from Instagram bio text. Returns None if unclear."""
    if not bio:
        return None
    bio_lower = bio.lower()
    for borough, keywords in BOROUGH_BIO_KEYWORDS.items():
        for keyword in keywords:
            if keyword in bio_lower:
                return borough
    # Check for generic NYC without borough — skip, we need a borough
    return None


def extract_phone_from_bio(bio: str) -> str | None:
    """Extract phone number from Instagram bio text."""
    if not bio:
        return None
    m = re.search(r"\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}", bio)
    if m:
        return m.group().strip()
    # Try contiguous 10 digits
    m = re.search(r"\b\d{10}\b", bio)
    if m:
        digits = m.group()
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return None


def extract_email_from_bio(bio: str) -> str | None:
    """Extract email from Instagram bio text."""
    if not bio:
        return None
    matches = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", bio)
    return matches[0] if matches else None


def parse_follower_count(text: str) -> int | None:
    """Parse follower count text like '1,234' or '12.3K' or '1.2M'."""
    if not text:
        return None
    text = text.strip().upper().replace(",", "")
    m = re.match(r"([\d.]+)([KM])?", text)
    if not m:
        return None
    num = float(m.group(1))
    suffix = m.group(2)
    if suffix == "K":
        return int(num * 1000)
    elif suffix == "M":
        return int(num * 1_000_000)
    return int(num)


async def collect_usernames_from_hashtag(page, hashtag: str, max_posts: int = 30) -> list[str]:
    """Visit a hashtag page and collect unique usernames from post links."""
    url = f"https://www.instagram.com/explore/tags/{hashtag.lstrip('#')}/"
    usernames = []

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        # Check for login wall
        if "login" in page.url.lower():
            print(f"      Login wall hit on {hashtag} — skipping")
            return []

        # Scroll to load more posts
        for _ in range(5):
            await page.evaluate("window.scrollBy(0, 800)")
            await page.wait_for_timeout(1500)

        # Collect post links
        post_links = await page.locator('a[href*="/p/"]').all()
        post_hrefs = []
        for link in post_links[:max_posts]:
            href = await link.get_attribute("href")
            if href:
                post_hrefs.append(href)

        # Visit each post to get the username
        seen = set()
        for href in post_hrefs:
            try:
                full_url = f"https://www.instagram.com{href}" if href.startswith("/") else href
                await page.goto(full_url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(2000)

                # Get username from the post page
                username_el = page.locator('a[href^="/"][role="link"] span').first
                if await username_el.count() > 0:
                    username = (await username_el.inner_text()).strip().lstrip("@")
                    if username and username not in seen:
                        seen.add(username)
                        usernames.append(username)

                delay = random.uniform(INSTAGRAM_DELAY_MIN, INSTAGRAM_DELAY_MAX)
                await page.wait_for_timeout(int(delay * 1000))
            except Exception:
                continue

    except Exception as e:
        print(f"      Error on hashtag {hashtag}: {e}")

    return usernames


async def scrape_profile(page, username: str, target_borough: str) -> dict | None:
    """Scrape a single Instagram profile. Returns a row dict or None."""
    try:
        url = f"https://www.instagram.com/{username}/"
        await page.goto(url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(2500)

        # Check for login wall or 404
        if "login" in page.url.lower():
            return None
        page_text = await page.locator("body").inner_text()
        if "Sorry, this page isn't available" in page_text:
            return None

        # Display name
        display_name = ""
        name_el = page.locator("header span").first
        if await name_el.count() > 0:
            display_name = (await name_el.inner_text()).strip()

        # Bio
        bio = ""
        bio_el = page.locator('header section div[style*="display"] span, header section div > span')
        if await bio_el.count() > 0:
            bio = (await bio_el.first.inner_text()).strip()

        # Follower count
        followers = None
        follower_el = page.locator('a[href*="followers"] span, li:has-text("followers") span')
        if await follower_el.count() > 0:
            follower_text = await follower_el.first.get_attribute("title") or await follower_el.first.inner_text()
            followers = parse_follower_count(follower_text)

        # Skip low-follower accounts
        if followers is not None and followers < INSTAGRAM_MIN_FOLLOWERS:
            return None

        # External link
        external_link = ""
        link_el = page.locator('a[rel="me nofollow noopener noreferrer"], header a[href*="l.instagram.com"]')
        if await link_el.count() > 0:
            external_link = (await link_el.first.get_attribute("href") or "").strip()

        # Category
        category = ""
        cat_el = page.locator('header div[class*="category"], header a[class*="category"]')
        if await cat_el.count() > 0:
            category = (await cat_el.first.inner_text()).strip()

        # Determine if this is a prospect
        link_type = classify_external_link(external_link)
        if link_type == "own_website":
            return None  # Has a real website — not our target

        # Detect borough
        borough = detect_borough_from_bio(bio)
        if not borough:
            # If scraping a specific borough, use that as default
            borough = target_borough if target_borough != "all" else None
        if not borough:
            return None  # Can't determine borough

        # Extract contact info from bio
        phone = extract_phone_from_bio(bio)
        email = extract_email_from_bio(bio)

        business_name = display_name or username

        return {
            "source": "instagram",
            "source_id": username,
            "business_name": business_name,
            "owner_name": "",
            "business_type": category.lower().replace(" ", "_") if category else "",
            "phone": phone or "",
            "email": email or "",
            "address": "",
            "borough": borough,
            "website": external_link if link_type == "own_website" else "",
            "website_type": link_type,
            "instagram_handle": username,
            "instagram_followers": str(followers) if followers else "",
            "google_maps_url": "",
            "rating": "",
            "review_count": "",
            "all_links": external_link if external_link else "",
            "is_prospect": "true",
            "raw_data": json.dumps({
                "bio": bio,
                "category": category,
                "external_link": external_link,
                "display_name": display_name,
            }),
        }

    except Exception as e:
        print(f"      Error scraping @{username}: {e}")
        return None


async def scrape_instagram(borough: str, limit: int = 200) -> str:
    """Scrape Instagram for hair/beauty leads in a borough.

    Args:
        borough: Borough name or 'all'
        limit: Max leads to collect

    Returns:
        Path to output CSV file
    """
    hashtags = get_instagram_hashtags(borough)
    all_rows = []
    seen_usernames = set()
    scraped_at = datetime.now(timezone.utc).isoformat()
    session_count = 0

    print(f"\nInstagram scraper — {borough}")
    print(f"Hashtags: {len(hashtags)}, Target: {limit}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            slow_mo=50,
        )
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=random.choice(USER_AGENTS),
        )
        page = await ctx.new_page()

        for hashtag in hashtags:
            if len(all_rows) >= limit or session_count >= INSTAGRAM_SESSION_LIMIT:
                break

            print(f"\n  #{hashtag.lstrip('#')}")
            usernames = await collect_usernames_from_hashtag(page, hashtag)
            print(f"    Found {len(usernames)} profiles")

            for username in usernames:
                if len(all_rows) >= limit or session_count >= INSTAGRAM_SESSION_LIMIT:
                    break
                if username in seen_usernames:
                    continue
                seen_usernames.add(username)
                session_count += 1

                row = await scrape_profile(page, username, borough)
                if row:
                    row["scraped_at"] = scraped_at
                    print(f"    [@{username}] {row['business_name'][:35]:<35} | {row['borough']:<12} | {row['phone'] or '—'}")
                    all_rows.append(row)

                delay = random.uniform(INSTAGRAM_DELAY_MIN, INSTAGRAM_DELAY_MAX)
                await page.wait_for_timeout(int(delay * 1000))

        await browser.close()

    # Write CSV
    date_str = datetime.now().strftime("%Y-%m-%d")
    borough_label = borough if borough != "all" else "all"
    os.makedirs("output", exist_ok=True)
    output_path = f"output/instagram_{borough_label}_{date_str}.csv"

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(all_rows)

    # Summary
    total = len(all_rows)
    with_phone = sum(1 for r in all_rows if r["phone"])
    with_email = sum(1 for r in all_rows if r["email"])
    print(f"\nDone! {output_path}")
    print(f"  Total: {total}  With phone: {with_phone}  With email: {with_email}")

    return output_path
```

- [ ] **Step 2: Smoke test helper functions**

```bash
cd /Users/aws/Downloads/web-project/scraper
python -c "from scrapers.instagram import detect_borough_from_bio, extract_phone_from_bio, parse_follower_count, classify_external_link; \
print(detect_borough_from_bio('BK based braider | DM for appts')); \
print(extract_phone_from_bio('Book now: (718) 555-1234')); \
print(parse_follower_count('12.3K')); \
print(classify_external_link('https://booksy.com/test'))"
```

Expected output:
```
brooklyn
(718) 555-1234
12300
booking_app
```

- [ ] **Step 3: Commit**

```bash
cd /Users/aws/Downloads/web-project/scraper
git add scrapers/instagram.py
git commit -m "feat: add Instagram scraper for NYC hair/beauty profiles"
```

---

## Task 7: CLI Entry Point

**Files:**
- Create: `scraper/scrape.py`

- [ ] **Step 1: Write scrape.py**

Create `scraper/scrape.py`:

```python
#!/usr/bin/env python3
"""
Lead scraping CLI for SiteForOwners.

Usage:
    python scrape.py maps --borough queens --limit 200
    python scrape.py instagram --borough brooklyn --limit 200
    python scrape.py import --file output/maps_queens_2026-04-19.csv
    python scrape.py import --dir output/
"""

import argparse
import asyncio
import sys

from scrapers.config import BOROUGHS


def cmd_maps(args):
    from scrapers.maps import scrape_maps
    borough = args.borough.lower().replace(" ", "_")
    if borough != "all" and borough not in BOROUGHS:
        print(f"Error: Invalid borough '{args.borough}'. Choose from: {', '.join(BOROUGHS)} or 'all'")
        sys.exit(1)
    output = asyncio.run(scrape_maps(borough, args.limit))
    print(f"\nOutput: {output}")


def cmd_instagram(args):
    from scrapers.instagram import scrape_instagram
    borough = args.borough.lower().replace(" ", "_")
    if borough != "all" and borough not in BOROUGHS:
        print(f"Error: Invalid borough '{args.borough}'. Choose from: {', '.join(BOROUGHS)} or 'all'")
        sys.exit(1)
    output = asyncio.run(scrape_instagram(borough, args.limit))
    print(f"\nOutput: {output}")


def cmd_import(args):
    from importer.import_leads import import_csv, import_directory

    if args.file:
        print(f"Importing {args.file}...")
        stats = import_csv(args.file)
    elif args.dir:
        print(f"Importing all CSVs from {args.dir}...")
        stats = import_directory(args.dir)
    else:
        print("Error: Provide --file or --dir")
        sys.exit(1)

    print(f"\n{'='*50}")
    print(f"  Imported: {stats['imported']:>5} new leads")
    print(f"  Skipped:  {stats['skipped']:>5} (already imported)")
    print(f"  Merged:   {stats['merged']:>5} (phone/name match)")
    print(f"  Flagged:  {stats['flagged']:>5} (fuzzy match, needs review)")
    print(f"{'='*50}")


def main():
    parser = argparse.ArgumentParser(
        description="SiteForOwners Lead Scraper — NYC hair/beauty businesses"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # maps subcommand
    maps_parser = subparsers.add_parser("maps", help="Scrape Google Maps")
    maps_parser.add_argument("--borough", required=True, help="Borough name or 'all'")
    maps_parser.add_argument("--limit", type=int, default=200, help="Max leads (default: 200)")
    maps_parser.set_defaults(func=cmd_maps)

    # instagram subcommand
    ig_parser = subparsers.add_parser("instagram", help="Scrape Instagram")
    ig_parser.add_argument("--borough", required=True, help="Borough name or 'all'")
    ig_parser.add_argument("--limit", type=int, default=200, help="Max leads (default: 200)")
    ig_parser.set_defaults(func=cmd_instagram)

    # import subcommand
    import_parser = subparsers.add_parser("import", help="Import CSV to Supabase")
    import_parser.add_argument("--file", help="Path to CSV file")
    import_parser.add_argument("--dir", help="Directory of CSV files")
    import_parser.set_defaults(func=cmd_import)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify CLI help works**

```bash
cd /Users/aws/Downloads/web-project/scraper
python scrape.py --help
python scrape.py maps --help
python scrape.py instagram --help
python scrape.py import --help
```

Expected: Help text for each subcommand

- [ ] **Step 3: Commit**

```bash
cd /Users/aws/Downloads/web-project/scraper
git add scrape.py
git commit -m "feat: add CLI entry point with maps, instagram, and import subcommands"
```

---

## Task 8: Project Setup Files

**Files:**
- Create: `scraper/requirements.txt`
- Create: `scraper/.gitignore`
- Create: `scraper/output/.gitkeep`

- [ ] **Step 1: Write requirements.txt**

Create `scraper/requirements.txt`:

```
playwright>=1.40.0
supabase>=2.0.0
python-Levenshtein>=0.23.0
python-dotenv>=1.0.0
pytest>=8.0.0
```

- [ ] **Step 2: Write .gitignore**

Create `scraper/.gitignore`:

```
output/*.csv
.env
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 3: Create output directory**

```bash
mkdir -p /Users/aws/Downloads/web-project/scraper/output
touch /Users/aws/Downloads/web-project/scraper/output/.gitkeep
```

- [ ] **Step 4: Install dependencies and run full test suite**

```bash
cd /Users/aws/Downloads/web-project/scraper
pip install -r requirements.txt
python -m playwright install chromium
python -m pytest tests/ -v
```

Expected: All tests pass (test_config: 7, test_dedup: 14, test_import: 10 = 31 total)

- [ ] **Step 5: Commit**

```bash
cd /Users/aws/Downloads/web-project/scraper
git add requirements.txt .gitignore output/.gitkeep
git commit -m "chore: add project setup files (requirements, gitignore, output dir)"
```

---

## Task 9: Manual End-to-End Test — Google Maps

- [ ] **Step 1: Run a small Maps scrape**

```bash
cd /Users/aws/Downloads/web-project/scraper
python scrape.py maps --borough brooklyn --limit 10
```

Expected: Browser opens, scrapes ~10 Brooklyn hair/beauty leads, saves to `output/maps_brooklyn_2026-04-19.csv`

- [ ] **Step 2: Verify CSV output**

```bash
head -5 output/maps_brooklyn_*.csv
wc -l output/maps_brooklyn_*.csv
```

Expected: CSV with header + data rows, columns matching `CSV_COLUMNS`

- [ ] **Step 3: Import into Supabase**

```bash
cd /Users/aws/Downloads/web-project/scraper
cp .env.example .env
# Edit .env with actual Supabase credentials
python scrape.py import --file output/maps_brooklyn_*.csv
```

Expected: Import summary showing imported count, 0 skipped/merged/flagged (first run)

- [ ] **Step 4: Re-import to verify dedup skip**

```bash
python scrape.py import --file output/maps_brooklyn_*.csv
```

Expected: All records show as "skipped" (already imported)

---

## Task 10: Manual End-to-End Test — Instagram

- [ ] **Step 1: Run a small Instagram scrape**

```bash
cd /Users/aws/Downloads/web-project/scraper
python scrape.py instagram --borough brooklyn --limit 10
```

Expected: Browser opens, visits hashtag pages, scrapes profiles, saves to `output/instagram_brooklyn_2026-04-19.csv`

Note: Instagram may show login walls. If so, the scraper will skip those hashtags and continue. You may need to adjust selectors based on current Instagram HTML structure.

- [ ] **Step 2: Import and verify cross-platform dedup**

```bash
python scrape.py import --file output/instagram_brooklyn_*.csv
```

Expected: Import summary. If any Instagram leads share a phone number with Maps leads, they should show as "merged". Fuzzy name matches show as "flagged".

- [ ] **Step 3: Commit any selector fixes**

If Instagram selectors needed adjustment during testing, commit those changes:

```bash
cd /Users/aws/Downloads/web-project/scraper
git add scrapers/instagram.py
git commit -m "fix: adjust Instagram selectors for current HTML structure"
```
