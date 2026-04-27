-- Spec 4 (booking polish): owner-managed category list per preview.
-- Stored as a top-level jsonb column to mirror the existing previews.services
-- column shape. Validation (max 10 entries, ≤ 60 chars each, unique) is
-- enforced server-side in src/lib/validation/categories.ts.

ALTER TABLE previews
  ADD COLUMN IF NOT EXISTS categories jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN previews.categories IS
  'Spec 4: owner-managed ordered category list. Each entry is a string;
   services[].category must reference one of these. Validated server-side
   (max 10 entries, each <= 60 chars, deduplicated case-insensitively).';
