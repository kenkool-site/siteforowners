DROP FUNCTION IF EXISTS public.update_owner_profile(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.update_owner_profile(
  p_tenant_id uuid,
  p_business_name text,
  p_phone text,
  p_admin_email text,
  p_tagline text,
  p_about_en jsonb,
  p_about_es jsonb,
  p_about_image_url text,
  p_social_links jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_preview_slug text;
  current_generated_copy jsonb;
  current_en jsonb;
  current_es jsonb;
  current_section_settings jsonb;
  next_generated_copy jsonb;
  stored_preview_business_name text;
  stored_preview_phone text;
  stored_generated_copy jsonb;
  stored_tenant_phone text;
  stored_admin_email text;
BEGIN
  SELECT tenants.preview_slug
  INTO resolved_preview_slug
  FROM public.tenants
  WHERE tenants.id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF resolved_preview_slug IS NULL THEN
    RAISE EXCEPTION 'Tenant has no preview';
  END IF;

  SELECT previews.generated_copy
  INTO current_generated_copy
  FROM public.previews
  WHERE previews.slug = resolved_preview_slug
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preview not found';
  END IF;

  IF current_generated_copy IS NULL
    OR jsonb_typeof(current_generated_copy) <> 'object'
  THEN
    current_generated_copy := '{}'::jsonb;
  END IF;

  current_en := CASE
    WHEN jsonb_typeof(current_generated_copy -> 'en') = 'object'
      THEN current_generated_copy -> 'en'
    ELSE '{}'::jsonb
  END;
  current_es := CASE
    WHEN jsonb_typeof(current_generated_copy -> 'es') = 'object'
      THEN current_generated_copy -> 'es'
    ELSE '{}'::jsonb
  END;
  current_section_settings := CASE
    WHEN jsonb_typeof(current_generated_copy -> 'section_settings') = 'object'
      THEN current_generated_copy -> 'section_settings'
    ELSE '{}'::jsonb
  END;

  next_generated_copy :=
    current_generated_copy
    || jsonb_build_object(
      'en',
      current_en || jsonb_build_object(
        'hero_subheadline', p_tagline,
        'about_paragraphs', p_about_en
      ),
      'es',
      current_es || jsonb_build_object(
        'about_paragraphs', p_about_es
      ),
      'section_settings',
      current_section_settings || jsonb_build_object(
        'about_image_url', p_about_image_url
      ),
      'social_links',
      COALESCE(p_social_links, 'null'::jsonb)
    );

  UPDATE public.previews
  SET
    business_name = p_business_name,
    phone = p_phone,
    generated_copy = next_generated_copy
  WHERE previews.slug = resolved_preview_slug
  RETURNING
    previews.business_name,
    previews.phone,
    previews.generated_copy
  INTO
    stored_preview_business_name,
    stored_preview_phone,
    stored_generated_copy;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preview not found';
  END IF;

  UPDATE public.tenants
  SET
    business_name = p_business_name,
    phone = p_phone,
    sms_phone = p_phone,
    admin_email = p_admin_email,
    updated_at = now()
  WHERE tenants.id = p_tenant_id
  RETURNING
    tenants.phone,
    tenants.admin_email
  INTO
    stored_tenant_phone,
    stored_admin_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant update failed';
  END IF;

  RETURN jsonb_build_object(
    'preview',
    jsonb_build_object(
      'business_name', stored_preview_business_name,
      'phone', stored_preview_phone,
      'generated_copy', stored_generated_copy
    ),
    'tenant',
    jsonb_build_object(
      'phone', stored_tenant_phone,
      'admin_email', stored_admin_email
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_owner_profile(
  uuid, text, text, text, text, jsonb, jsonb, text, jsonb
)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_owner_profile(
  uuid, text, text, text, text, jsonb, jsonb, text, jsonb
)
FROM anon;
REVOKE ALL ON FUNCTION public.update_owner_profile(
  uuid, text, text, text, text, jsonb, jsonb, text, jsonb
)
FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_owner_profile(
  uuid, text, text, text, text, jsonb, jsonb, text, jsonb
)
TO service_role;
