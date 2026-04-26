import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toE164 } from "@/lib/sms";

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const raw = (body as Record<string, unknown>).sms_phone;
  let smsPhone: string | null = null;
  if (raw === null || raw === "" || raw === undefined) {
    smsPhone = null;
  } else if (typeof raw === "string") {
    const normalized = toE164(raw);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid phone format" }, { status: 400 });
    }
    smsPhone = normalized;
  } else {
    return NextResponse.json({ error: "sms_phone must be a string or null" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tenants")
    .update({ sms_phone: smsPhone })
    .eq("id", session.tenant.id);
  if (error) {
    console.error("[admin/tenants/sms-phone] update failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sms_phone: smsPhone });
}
