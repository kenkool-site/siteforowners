import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GALLERY_VIDEO_MIME_TYPE,
  MAX_GALLERY_VIDEO_BYTES,
  MAX_GALLERY_VIDEO_SECONDS,
} from "@/lib/video/gallery-video";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!(body !== null && typeof body === "object" && !Array.isArray(body))) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const fallbackTenantId = typeof b.tenant_id === "string" ? b.tenant_id : undefined;
  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = b.type;
  const size = b.size;
  const durationSeconds = b.durationSeconds;

  if (type !== GALLERY_VIDEO_MIME_TYPE) {
    return NextResponse.json({ error: "Use an MP4 video." }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0 || size > MAX_GALLERY_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video must be 25MB or smaller." }, { status: 400 });
  }
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_GALLERY_VIDEO_SECONDS
  ) {
    return NextResponse.json({ error: "Video must be 30 seconds or shorter." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const path = `gallery-videos/${crypto.randomUUID()}.mp4`;
  const { data: signed, error: signedError } = await supabase.storage
    .from("preview-images")
    .createSignedUploadUrl(path);

  if (signedError || !signed) {
    console.error("[upload-gallery-video] signed URL failed", { tenantId: auth.tenantId, error: signedError });
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from("preview-images").getPublicUrl(path);
  return NextResponse.json({
    path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    publicUrl: publicData.publicUrl,
  });
}
