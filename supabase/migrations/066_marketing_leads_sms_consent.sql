-- Optional SMS opt-in captured on the public /request-site form.
-- Existing rows and inserts that omit these columns stay valid:
-- sms_consent defaults to false, and the audit columns stay null.
ALTER TABLE marketing_leads
  ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_text text,
  ADD COLUMN IF NOT EXISTS sms_consent_version text,
  ADD COLUMN IF NOT EXISTS sms_consent_ip text,
  ADD COLUMN IF NOT EXISTS sms_consent_user_agent text;
