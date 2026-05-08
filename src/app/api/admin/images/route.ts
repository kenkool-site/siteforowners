import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_IMAGES = 50;

async function getPreviewSlug(tenantId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  return (data?.preview_slug as string | null | undefined) ?? null;
}

export async function GET(request: NextRequest) {
  const tenantIdParam = new URL(request.url).searchParams.get("tenant_id") ?? undefined;
  const auth = await requireOwnerOrFounder(request, tenantIdParam);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = await getPreviewSlug(auth.tenantId);
  if (!slug) return NextResponse.json({ images: [] });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("images")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[admin/images] load failed", { tenantId: auth.tenantId, error });
    return NextResponse.json({ error: "Load failed" }, { status: 500 });
  }
  return NextResponse.json({ images: (data?.images as string[] | null) ?? [] });
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

  const raw = (body as Record<string, unknown>)?.images;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Validation failed", errors: [{ field: "images", reason: "must be an array" }] },
      { status: 400 },
    );
  }
  if (raw.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: "Validation failed", errors: [{ field: "images", reason: `max ${MAX_IMAGES} images` }] },
      { status: 400 },
    );
  }

  // Each entry must be a non-empty https URL string. We don't enforce a
  // specific host because images can also live on places.googleapis.com
  // (imported from Google Maps) — both the upload endpoint and the
  // re-import flow produce safe https URLs.
  const images: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (typeof v !== "string" || !/^https:\/\//.test(v)) {
      return NextResponse.json(
        { error: "Validation failed", errors: [{ field: `images[${i}]`, reason: "must be an https URL" }] },
        { status: 400 },
      );
    }
    images.push(v);
  }

  const slug = await getPreviewSlug(auth.tenantId);
  if (!slug) return NextResponse.json({ error: "Tenant has no preview_slug" }, { status: 500 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("previews")
    .update({ images })
    .eq("slug", slug);
  if (error) {
    console.error("[admin/images] save failed", { tenantId: auth.tenantId, error });
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, images });
}
