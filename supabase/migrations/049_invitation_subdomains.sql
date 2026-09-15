ALTER TABLE invitation_events
  ADD COLUMN IF NOT EXISTS public_subdomain text UNIQUE;

CREATE TABLE IF NOT EXISTS platform_subdomains (
  label text PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  invitation_event_id uuid REFERENCES invitation_events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(tenant_id, invitation_event_id) = 1),
  CHECK (char_length(label) BETWEEN 1 AND 40),
  CHECK (label ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  CHECK (label <> ALL (ARRAY[
    'www', 'api', 'admin', 'app', 'mail', 'support', 'help', 'status',
    'static', 'assets', 'cdn', 'dashboard', 'invitations', 'invite', 'login', 'preview'
  ])),
  UNIQUE (tenant_id),
  UNIQUE (invitation_event_id)
);

INSERT INTO platform_subdomains (label, tenant_id)
SELECT lower(btrim(subdomain)), id
FROM tenants
WHERE subdomain IS NOT NULL
  AND btrim(subdomain) <> ''
ON CONFLICT (label) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_platform_subdomain_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  old_label text;
  new_label text;
BEGIN
  IF TG_TABLE_NAME = 'tenants' THEN
    old_label := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.subdomain END;
    new_label := NEW.subdomain;
    IF old_label IS DISTINCT FROM new_label THEN
      DELETE FROM platform_subdomains
      WHERE tenant_id = NEW.id AND label = old_label;
      IF new_label IS NOT NULL THEN
        BEGIN
          INSERT INTO platform_subdomains (label, tenant_id)
          VALUES (new_label, NEW.id);
        EXCEPTION WHEN unique_violation OR check_violation THEN
          RAISE EXCEPTION 'PLATFORM_SUBDOMAIN_TAKEN' USING ERRCODE = 'P0001';
        END;
      END IF;
    END IF;
  ELSE
    old_label := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.public_subdomain END;
    new_label := NEW.public_subdomain;
    IF old_label IS DISTINCT FROM new_label THEN
      DELETE FROM platform_subdomains
      WHERE invitation_event_id = NEW.id AND label = old_label;
      IF new_label IS NOT NULL THEN
        BEGIN
          INSERT INTO platform_subdomains (label, invitation_event_id)
          VALUES (new_label, NEW.id);
        EXCEPTION WHEN unique_violation OR check_violation THEN
          RAISE EXCEPTION 'PLATFORM_SUBDOMAIN_TAKEN' USING ERRCODE = 'P0001';
        END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_tenant_subdomain ON tenants;
CREATE TRIGGER sync_tenant_subdomain
AFTER INSERT OR UPDATE OF subdomain ON tenants
FOR EACH ROW EXECUTE FUNCTION sync_platform_subdomain_reservation();

DROP TRIGGER IF EXISTS sync_invitation_subdomain ON invitation_events;
CREATE TRIGGER sync_invitation_subdomain
AFTER INSERT OR UPDATE OF public_subdomain ON invitation_events
FOR EACH ROW EXECUTE FUNCTION sync_platform_subdomain_reservation();

ALTER TABLE platform_subdomains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_subdomains FROM anon, authenticated;
