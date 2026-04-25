import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendUpdateRequestNotification } from "@/lib/email";

const VALID_CATEGORIES = ["hours", "photo", "service", "pricing", "text", "other"];

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const category = typeof b.category === "string" ? b.category : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  const attachmentUrl = typeof b.attachmentUrl === "string" ? b.attachmentUrl : null;

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (description.length < 5) {
    return NextResponse.json({ error: "Description must be at least 5 characters" }, { status: 400 });
  }
  if (description.length > 5000) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase
    .from("update_requests")
    .insert({
      tenant_id: session.tenant.id,
      category,
      description,
      attachment_url: attachmentUrl,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("[admin/updates] insert failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  // Notify founder (don't block response on email failure)
  sendUpdateRequestNotification({
    tenantId: session.tenant.id,
    businessName: session.tenant.business_name,
    category,
    description,
    attachmentUrl,
  }).catch((err) => console.error("[admin/updates] email failed", err));

  return NextResponse.json({ ok: true, id: inserted.id });
}
