CREATE OR REPLACE FUNCTION create_invitation_owner_and_event(
  p_owner jsonb,
  p_event jsonb
)
RETURNS TABLE (owner_id uuid, event_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id uuid;
  v_event_id uuid;
BEGIN
  INSERT INTO public.invitation_owners (
    name,
    email,
    phone,
    pin_hash
  ) VALUES (
    btrim(p_owner ->> 'name'),
    lower(btrim(p_owner ->> 'email')),
    NULLIF(btrim(p_owner ->> 'phone'), ''),
    p_owner ->> 'pin_hash'
  )
  RETURNING id INTO v_owner_id;

  INSERT INTO public.invitation_events (
    owner_id,
    slug,
    event_type,
    locale,
    title,
    starts_at,
    timezone,
    submission_limit,
    email_notification_limit,
    sms_notification_limit,
    notification_email
  ) VALUES (
    v_owner_id,
    p_event ->> 'slug',
    p_event ->> 'event_type',
    p_event ->> 'locale',
    p_event ->> 'title',
    NULLIF(p_event ->> 'starts_at', '')::timestamptz,
    p_event ->> 'timezone',
    (p_event ->> 'submission_limit')::integer,
    (p_event ->> 'email_notification_limit')::integer,
    (p_event ->> 'sms_notification_limit')::integer,
    lower(btrim(p_event ->> 'notification_email'))
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT v_owner_id, v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION create_invitation_owner_and_event(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_invitation_owner_and_event(jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION create_invitation_owner_and_event(jsonb, jsonb) TO service_role;
