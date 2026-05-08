import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_IMAGES = 50;

interface PreviewSnapshot {
  images: string[];
  /** Currently chosen About-Us image URL, or null when using template default. */
  about_image_url: string | null;
}

async function getPreviewSlug(tenantId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.preview_slug as string | null | undefined) ?? null;
}

async function loadSnapshot(slug: string): Promise<PreviewSnapshot> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("previews")
    .select("images, generated_copy")
    .eq("slug", slug)
    .maybeSingle();
  const images = (data?.images as string[] | null) ?? [];
  const copy = (data?.generated_copy as Record<string, unknown> | null) ?? {};
  const settings = (copy.section_settings as Record<string, unknown> | undefined) ?? {};
  const about = settings.about_image_url;
  return {
    images,
    about_image_url: typeof about === "string" && about.length > 0 ? about : null,
  };
}

export async function GET(request: NextRequest) {
  const tenantIdParam = new URL(request.url).searchParams.get("tenant_id") ?? undefined;
  const auth = await requireOwnerOrFounder(request, tenantIdParam);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = await getPreviewSlug(auth.tenantId);
  if (!slug) return NextResponse.json({ images: [], about_image_url: null });

  try {
    const snapshot = await loadSnapshot(slug);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[admin/images] load failed", { tenantId: auth.tenantId, error });
    return NextResponse.json({ error: "Load failed" }, { status: 500 });
  }
}

function isValidImageUrl(v: unknown): v is string {
  return typeof v === "string" && /^https:\/\//.test(v);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const fallbackTenantId =
    typeof (body as Record<string, unknown>)?.tenant_id === "string"
      ? ((body as Record<string, unknown>).tenant_id as string)
      : undefined;

  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = body as Record<string, unknown>;

  // images — required, array of https URLs, max length cap.
  const rawImages = b.images;
  if (!Array.isArray(rawImages)) {
    return NextResponse.json(
      { error: "Validation failed", errors: [{ field: "images", reason: "must be an array" }] },
      { status: 400 },
    );
  }
  if (rawImages.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: "Validation failed", errors: [{ field: "images", reason: `max ${MAX_IMAGES} images` }] },
      { status: 400 },
    );
  }
  const images: string[] = [];
  for (let i = 0; i < rawImages.length; i++) {
    if (!isValidImageUrl(rawImages[i])) {
      return NextResponse.json(
        { error: "Validation failed", errors: [{ field: `images[${i}]`, reason: "must be an https URL" }] },
        { status: 400 },
      );
    }
    images.push(rawImages[i] as string);
  }

  // about_image_url — optional, must be string|null|undefined. Empty string
  // and null are equivalent (clear → use template default).
  const rawAbout = b.about_image_url;
  let aboutImageUrl: string | null = null;
  let touchAbout = false;
  if (rawAbout === undefined) {
    touchAbout = false;
  } else if (rawAbout === null || rawAbout === "") {
    touchAbout = true;
    aboutImageUrl = null;
  } else if (isValidImageUrl(rawAbout)) {
    touchAbout = true;
    aboutImageUrl = rawAbout;
  } else {
    return NextResponse.json(
      { error: "Validation failed", errors: [{ field: "about_image_url", reason: "must be an https URL or null" }] },
      { status: 400 },
    );
  }

  const slug = await getPreviewSlug(auth.tenantId);
  if (!slug) return NextResponse.json({ error: "Tenant has no preview_slug" }, { status: 500 });

  const supabase = createAdminClient();

  // section_settings lives nested inside generated_copy. Read-modify-write
  // to preserve sibling keys (show_about, show_gallery, template_override,
  // booking_iframe_top_clip_px, etc.). Skipped entirely when the request
  // didn't supply about_image_url.
  if (touchAbout) {
    const { data: existing } = await supabase
      .from("previews")
      .select("generated_copy")
      .eq("slug", slug)
      .maybeSingle();
    const copy = (existing?.generated_copy as Record<string, unknown> | null) ?? {};
    const settings = { ...((copy.section_settings as Record<string, unknown> | undefined) ?? {}) };
    settings.about_image_url = aboutImageUrl;
    const nextCopy = { ...copy, section_settings: settings };
    const { error: copyError } = await supabase
      .from("previews")
      .update({ images, generated_copy: nextCopy })
      .eq("slug", slug);
    if (copyError) {
      console.error("[admin/images] save failed (with about)", { tenantId: auth.tenantId, error: copyError });
      return NextResponse.json({ error: "Save failed" }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("previews")
      .update({ images })
      .eq("slug", slug);
    if (error) {
      console.error("[admin/images] save failed (images-only)", { tenantId: auth.tenantId, error });
      return NextResponse.json({ error: "Save failed" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    images,
    about_image_url: touchAbout ? aboutImageUrl : undefined,
  });
}
