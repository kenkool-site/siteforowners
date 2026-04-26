import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: NextRequest) {
  // Founder must include tenant_id as a form field; owner uses session.
  const formData = await request.formData();
  const fallbackTenantId =
    typeof formData.get("tenant_id") === "string"
      ? (formData.get("tenant_id") as string)
      : undefined;

  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image file required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}. Use JPG, PNG, or WebP.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 });
  }

  // Derive extension from the validated MIME type (file.name is client-supplied
  // and could contain path traversal characters or arbitrary extensions).
  const extByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const ext = extByType[file.type] ?? "jpg";
  const id = crypto.randomUUID();
  const filePath = `tenants/${auth.tenantId}/${id}.${ext}`;

  const supabase = createAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("service-images")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    console.error("[admin/services/upload-image] storage upload failed", { uploadError });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("service-images").getPublicUrl(filePath);
  return NextResponse.json({ url: urlData.publicUrl });
}
