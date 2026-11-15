-- Optional premium private guest list. Off by default: anyone with the event
-- link can still RSVP. When invitation_events.private_guest_list_enabled is
-- true, only phone numbers on invitation_guests can reply, and hosts send
-- the texts themselves. Founder routes are the only writers of the flag;
-- there is no host policy that can turn it on.
--
-- All access stays on the service role, matching the other invitation tables.

ALTER TABLE public.invitation_events
  ADD COLUMN IF NOT EXISTS private_guest_list_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.invitation_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text CHECK (email IS NULL OR email = lower(btrim(email))),
  seats_allowed integer NOT NULL DEFAULT 1 CHECK (seats_allowed BETWEEN 1 AND 20),
  household text CHECK (household IS NULL OR char_length(household) <= 80),
  token text NOT NULL CHECK (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  delivery_status text NOT NULL DEFAULT 'not_sent'
    CHECK (delivery_status IN ('not_sent', 'sending', 'sent', 'delivered', 'failed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  opened_at timestamptz,
  opted_out_at timestamptz,
  rsvp_attending boolean,
  rsvp_party_size integer CHECK (rsvp_party_size IS NULL OR rsvp_party_size BETWEEN 0 AND 20),
  rsvp_id uuid,
  reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, phone_e164),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS invitation_guests_event_id_idx
  ON public.invitation_guests (event_id, created_at);

CREATE TABLE IF NOT EXISTS public.invitation_guest_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.invitation_guests(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('invite', 'reminder', 'verification')),
  to_phone text NOT NULL,
  body text NOT NULL,
  segment_count integer NOT NULL CHECK (segment_count >= 0),
  twilio_sid text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitation_guest_messages_sid_idx
  ON public.invitation_guest_messages (twilio_sid)
  WHERE twilio_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS invitation_guest_messages_guest_idx
  ON public.invitation_guest_messages (guest_id, created_at DESC);

-- A STOP reply applies to the phone number, not one event, so later events
-- cannot text it until START.
CREATE TABLE IF NOT EXISTS public.invitation_sms_opt_outs (
  phone_e164 text PRIMARY KEY CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invitation_guest_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.invitation_guests(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invitation_guest_verifications_guest_idx
  ON public.invitation_guest_verifications (guest_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invitation_guest_list_rate_limits (
  bucket text PRIMARY KEY CHECK (char_length(bucket) BETWEEN 1 AND 200),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invitation_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_guest_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_sms_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_guest_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_guest_list_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invitation_guests, public.invitation_guest_messages,
  public.invitation_sms_opt_outs, public.invitation_guest_verifications,
  public.invitation_guest_list_rate_limits
  FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.attempt_guest_list_rate_limit(
  p_bucket text,
  p_window_seconds integer,
  p_max_attempts integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  IF p_window_seconds <= 0 OR p_max_attempts <= 0 OR char_length(p_bucket) < 1 OR char_length(p_bucket) > 200 THEN
    RAISE EXCEPTION 'guest list limiter requires a bucket and positive limits';
  END IF;

  INSERT INTO public.invitation_guest_list_rate_limits AS current_limit (
    bucket,
    window_started_at,
    attempt_count,
    updated_at
  )
  VALUES (p_bucket, pg_catalog.now(), 1, pg_catalog.now())
  ON CONFLICT (bucket) DO UPDATE
    SET
      window_started_at = CASE
        WHEN current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
          THEN pg_catalog.now()
        ELSE current_limit.window_started_at
      END,
      attempt_count = CASE
        WHEN current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
          THEN 1
        ELSE current_limit.attempt_count + 1
      END,
      updated_at = pg_catalog.now()
    WHERE current_limit.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
      OR current_limit.attempt_count < p_max_attempts
  RETURNING true INTO v_allowed;

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.attempt_guest_list_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attempt_guest_list_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attempt_guest_list_rate_limit(text, integer, integer) TO service_role;
