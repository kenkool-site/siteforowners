ALTER TABLE estimate_requests
  ADD COLUMN IF NOT EXISTS text_notification_state text,
  ADD COLUMN IF NOT EXISTS text_provider_message_id text,
  ADD COLUMN IF NOT EXISTS text_provider_error text,
  ADD COLUMN IF NOT EXISTS email_notification_state text,
  ADD COLUMN IF NOT EXISTS email_provider_message_id text,
  ADD COLUMN IF NOT EXISTS email_provider_error text,
  ADD COLUMN IF NOT EXISTS email_notification_destination text;

UPDATE estimate_requests
SET text_notification_state = notification_state,
    text_provider_message_id = provider_message_id,
    text_provider_error = provider_error
WHERE text_notification_state IS NULL;

UPDATE estimate_requests
SET email_notification_state = 'not_configured'
WHERE email_notification_state IS NULL;

ALTER TABLE estimate_requests
  ALTER COLUMN text_notification_state SET DEFAULT 'pending',
  ALTER COLUMN text_notification_state SET NOT NULL,
  ALTER COLUMN email_notification_state SET DEFAULT 'not_configured',
  ALTER COLUMN email_notification_state SET NOT NULL,
  ADD CONSTRAINT estimate_requests_text_notification_state_check
    CHECK (text_notification_state IN ('not_configured', 'pending', 'sent', 'failed')),
  ADD CONSTRAINT estimate_requests_email_notification_state_check
    CHECK (email_notification_state IN ('not_configured', 'pending', 'sent', 'failed'));
