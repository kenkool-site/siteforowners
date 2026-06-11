import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import {
  ownerProfileToEditable,
  parseOwnerProfileInput,
  type OwnerProfileInput,
} from "@/lib/owner-profile";
import { createAdminClient } from "@/lib/supabase/admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unavailableResponse() {
  return NextResponse.json(
    { error: "Website profile unavailable" },
    { status: 404 },
  );
}

export async function GET(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = session.tenant.preview_slug;
  if (!slug) return unavailableResponse();

  const supabase = createAdminClient();
  const { data: preview, error } = await supabase
    .from("previews")
    .select("business_name, phone, generated_copy")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[admin/profile] preview load failed", {
      tenantId: session.tenant.id,
      error,
    });
    return NextResponse.json({ error: "Profile load failed" }, { status: 500 });
  }
  if (!preview) return unavailableResponse();

  return NextResponse.json(ownerProfileToEditable(preview, session.tenant));
}

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = parseOwnerProfileInput(body as OwnerProfileInput);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Validation failed", errors: parsed.errors },
      { status: 400 },
    );
  }

  const slug = session.tenant.preview_slug;
  if (!slug) return unavailableResponse();

  const supabase = createAdminClient();
  const { data: savedProfile, error: saveError } = await supabase.rpc(
    "update_owner_profile",
    {
      p_tenant_id: session.tenant.id,
      p_business_name: parsed.value.business_name,
      p_phone: parsed.value.phone,
      p_admin_email: parsed.value.admin_email,
      p_tagline: parsed.value.tagline,
      p_about_en: parsed.value.about_en,
      p_about_es: parsed.value.about_es,
      p_about_image_url: parsed.value.about_image_url,
      p_social_links: parsed.value.social_links,
    },
  );

  if (saveError) {
    console.error("[admin/profile] atomic profile update failed", {
      tenantId: session.tenant.id,
      error: saveError,
    });
    return NextResponse.json({ error: "Profile save failed" }, { status: 500 });
  }

  if (
    !isRecord(savedProfile) ||
    !isRecord(savedProfile.preview) ||
    !isRecord(savedProfile.tenant)
  ) {
    console.error("[admin/profile] atomic profile update returned invalid data", {
      tenantId: session.tenant.id,
    });
    return NextResponse.json({ error: "Profile save failed" }, { status: 500 });
  }

  return NextResponse.json(
    ownerProfileToEditable(savedProfile.preview, savedProfile.tenant),
  );
}
