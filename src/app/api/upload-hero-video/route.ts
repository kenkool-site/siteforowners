import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["video/mp4", "video/webm"];
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/admin_session=([^;]+)/);
  if (!ADMIN_PASSWORD || !match || match[1] !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("video") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type: ${file.type}. Use MP4 or WebM.` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File exceeds 10MB limit. Compress before uploading.` },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const ext = file.type === "video/webm" ? "webm" : "mp4";
    const id = crypto.randomUUID();
    const filePath = `hero-videos/${id}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("preview-images")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload video" },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from("preview-images")
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload video" },
      { status: 500 }
    );
  }
}
