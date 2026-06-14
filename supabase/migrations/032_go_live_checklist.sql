-- 032_go_live_checklist.sql
-- Per-client go-live checklist: stores manual completions as { itemId: ISO-timestamp }.
-- Auto items are derived at render time and never stored here.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS go_live_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;
