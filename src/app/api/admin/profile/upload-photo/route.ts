import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import {
  detectProfileImageType,
  profileImageTypeMatches,
} from "@/lib/profile-image";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_MULTIPART_BODY_SIZE = MAX_FILE_SIZE + 256 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (
    contentLengthHeader === null ||
    !/^\d+$/.test(contentLengthHeader) ||
    !Number.isSafeInteger(Number(contentLengthHeader))
  ) {
    return NextResponse.json(
      { error: "Valid Content-Length required" },
      { status: 400 },
    );
  }
  if (Number(contentLengthHeader) > MAX_MULTIPART_BODY_SIZE) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 },
    );
  }

  let image: File;
  try {
    const formData = await request.formData();
    const formImage = formData.get("image");
    if (!(formImage instanceof File)) {
      return NextResponse.json(
        { error: "image file required" },
        { status: 400 },
      );
    }
    image = formImage;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!ALLOWED_CONTENT_TYPES.has(image.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use JPG, PNG, or WebP." },
      { status: 400 },
    );
  }
  if (image.size === 0) {
    return NextResponse.json({ error: "Image file is empty" }, { status: 400 });
  }
  if (image.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 5MB limit" },
      { status: 400 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await image.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const detectedType = detectProfileImageType(buffer);
  if (
    detectedType === null ||
    !profileImageTypeMatches(image.type, detectedType)
  ) {
    return NextResponse.json(
      { error: "Image content does not match its file type" },
      { status: 400 },
    );
  }

  const filePath = `tenants/${session.tenant.id}/profile/${crypto.randomUUID()}.${detectedType.extension}`;

  try {
    const supabase = createAdminClient();
    const { error: uploadError } = await supabase.storage
      .from("preview-images")
      .upload(filePath, buffer, {
        contentType: detectedType.contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[admin/profile/upload-photo] storage upload failed", {
        tenantId: session.tenant.id,
        error: uploadError,
      });
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("preview-images")
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error("[admin/profile/upload-photo] storage upload failed", {
      tenantId: session.tenant.id,
      error,
    });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
