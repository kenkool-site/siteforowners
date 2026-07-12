ALTER TABLE estimate_requests
  ADD COLUMN IF NOT EXISTS text_notification_state text NOT NULL DEFAULT 'pending'
    CHECK (text_notification_state IN ('not_configured', 'pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS text_provider_message_id text,
  ADD COLUMN IF NOT EXISTS text_provider_error text,
  ADD COLUMN IF NOT EXISTS email_notification_state text NOT NULL DEFAULT 'not_configured'
    CHECK (email_notification_state IN ('not_configured', 'pending', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS email_provider_message_id text,
  ADD COLUMN IF NOT EXISTS email_provider_error text,
  ADD COLUMN IF NOT EXISTS email_notification_destination text;
