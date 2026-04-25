import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const BUCKET = "update-attachments";

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF allowed" }, { status: 400 });
  }

  const ext = file.type.split("/")[1] || "bin";
  const path = `${session.tenant.id}/${randomBytes(16).toString("hex")}.${ext}`;

  const supabase = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("[admin/updates/attachment] upload failed", { tenantId: session.tenant.id, error: uploadErr });
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Return a long-lived signed URL (24h) so the founder email link works
  // for at least a day. The founder admin can re-sign on demand if needed.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24);
  if (signErr || !signed) {
    console.error("[admin/updates/attachment] sign failed", { error: signErr });
    return NextResponse.json({ error: "Sign failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
