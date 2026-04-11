-- Add Google Maps rating and review count to previews
ALTER TABLE previews ADD COLUMN IF NOT EXISTS rating numeric;
ALTER TABLE previews ADD COLUMN IF NOT EXISTS review_count integer;
