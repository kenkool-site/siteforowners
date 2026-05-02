import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mirrors `/api/upload-hero-video` but allows the public preview wizard (no admin cookie).
// Upload still goes direct to Supabase; bucket limits apply.
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ["video/mp4", "video/webm"];

export async function POST(request: Request) {
  try {
    const { type, size } = await request.json();

    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: "Use MP4 or WebM." }, { status: 400 });
    }
    if (typeof size !== "number" || size <= 0 || size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File exceeds 20MB. Compress before uploading.` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const ext = type === "video/webm" ? "webm" : "mp4";
    const path = `hero-videos/${crypto.randomUUID()}.${ext}`;

    const { data: signed, error: signedError } = await supabase.storage
      .from("preview-images")
      .createSignedUploadUrl(path);

    if (signedError || !signed) {
      console.error("Signed upload URL error:", signedError);
      return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
    }

    const { data: publicData } = supabase.storage.from("preview-images").getPublicUrl(path);

    return NextResponse.json({
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      publicUrl: publicData.publicUrl,
    });
  } catch (error) {
    console.error("Prepare preview hero upload error:", error);
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }
}
