-- Adds short-code redirect for Stripe checkout URLs.
-- checkout_short_code: 8-char random slug, looked up by /go/:code route.
-- checkout_url: full Stripe session URL stored at onboard time.
-- Both are nullable — only populated after "Onboard" is clicked.

ALTER TABLE interested_leads
  ADD COLUMN IF NOT EXISTS checkout_short_code TEXT,
  ADD COLUMN IF NOT EXISTS checkout_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interested_leads_checkout_short_code
  ON interested_leads (checkout_short_code)
  WHERE checkout_short_code IS NOT NULL;
