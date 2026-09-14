CREATE TABLE IF NOT EXISTS invitation_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  pin_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invitation_owners_email_lower_idx
  ON invitation_owners (lower(email));

CREATE TABLE IF NOT EXISTS invitation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES invitation_owners(id) ON DELETE RESTRICT,
  slug text NOT NULL,
  event_type text NOT NULL DEFAULT 'other',
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es')),
  title text NOT NULL DEFAULT '',
  honoree_names text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/New_York',
  venue_name text,
  address text,
  map_url text,
  theme_key text NOT NULL DEFAULT 'classic',
  primary_color text NOT NULL DEFAULT '#1f2937',
  accent_color text NOT NULL DEFAULT '#d4a373',
  font_pair_key text NOT NULL DEFAULT 'serif-sans',
  designed_invite_path text,
  cover_image_path text,
  video_path text,
  passcode_hash text,
  show_public_rsvp_count boolean NOT NULL DEFAULT false,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  rsvp_deadline timestamptz,
  submission_limit integer NOT NULL DEFAULT 250 CHECK (submission_limit > 0),
  email_notification_limit integer NOT NULL DEFAULT 250 CHECK (email_notification_limit > 0),
  sms_notification_limit integer NOT NULL DEFAULT 50 CHECK (sms_notification_limit > 0),
  owner_email_notifications boolean NOT NULL DEFAULT true,
  owner_sms_notifications boolean NOT NULL DEFAULT false,
  notification_email text,
  notification_phone text,
  guest_email_confirmations boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'rsvp_closed', 'expired', 'offline')),
  expire_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at > starts_at))
);

CREATE UNIQUE INDEX IF NOT EXISTS invitation_events_slug_idx
  ON invitation_events (slug);

CREATE INDEX IF NOT EXISTS invitation_events_owner_id_idx
  ON invitation_events (owner_id);

CREATE TABLE IF NOT EXISTS invitation_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES invitation_events(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('gallery_image')),
  storage_path text NOT NULL,
  alt_text text NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, storage_path),
  UNIQUE (event_id, sort_order)
);

CREATE INDEX IF NOT EXISTS invitation_media_event_id_idx
  ON invitation_media (event_id);

CREATE TABLE IF NOT EXISTS invitation_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES invitation_events(id) ON DELETE CASCADE,
  primary_name text NOT NULL,
  email text,
  phone text,
  attending boolean NOT NULL,
  party_size integer NOT NULL,
  additional_guest_names text[] NOT NULL DEFAULT '{}',
  dietary_or_accessibility_notes text,
  message text,
  edit_token_hash text NOT NULL,
  last_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, id),
  CHECK (
    NULLIF(BTRIM(email), '') IS NOT NULL
    OR NULLIF(BTRIM(phone), '') IS NOT NULL
  ),
  CHECK ((attending AND party_size >= 1) OR (NOT attending AND party_size = 0))
);

CREATE INDEX IF NOT EXISTS invitation_rsvps_event_id_idx
  ON invitation_rsvps (event_id);

CREATE INDEX IF NOT EXISTS invitation_rsvps_event_created_at_idx
  ON invitation_rsvps (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invitation_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES invitation_events(id) ON DELETE CASCADE,
  rsvp_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('owner', 'guest')),
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient text NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('rsvp_created', 'rsvp_updated', 'guest_confirmation')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  provider_message_id text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (event_id, rsvp_id)
    REFERENCES invitation_rsvps (event_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS invitation_notifications_event_id_idx
  ON invitation_notifications (event_id);

CREATE INDEX IF NOT EXISTS invitation_notifications_rsvp_id_idx
  ON invitation_notifications (rsvp_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('invitation-media', 'invitation-media', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 52428800;

ALTER TABLE invitation_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_notifications ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: all invitation access goes through server routes.
REVOKE ALL ON invitation_owners, invitation_events, invitation_media,
  invitation_rsvps, invitation_notifications FROM anon, authenticated;
