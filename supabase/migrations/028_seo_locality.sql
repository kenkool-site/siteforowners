-- Local SEO: service + locality landing pages (/l/{service}-{area})
ALTER TABLE previews
  ADD COLUMN IF NOT EXISTS seo_locality text;

COMMENT ON COLUMN previews.seo_locality IS
  'Area label for programmatic SEO landing pages (e.g. Brooklyn, NY). When blank, no /l/* pages are served.';
