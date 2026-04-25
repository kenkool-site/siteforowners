import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, hashPin, verifyPin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const session = await requireOwnerSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const currentPin = typeof b.currentPin === "string" ? b.currentPin : "";
  const newPin = typeof b.newPin === "string" ? b.newPin : "";

  if (!/^\d{4,8}$/.test(currentPin) || !/^\d{4,8}$/.test(newPin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }
  if (newPin === currentPin) {
    return NextResponse.json({ error: "New PIN must be different" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("admin_pin_hash")
    .eq("id", session.tenant.id)
    .maybeSingle();
  if (!tenant?.admin_pin_hash) {
    return NextResponse.json({ error: "PIN not set" }, { status: 400 });
  }

  const ok = await verifyPin(currentPin, tenant.admin_pin_hash);
  if (!ok) return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 401 });

  const newHash = await hashPin(newPin);
  const { error } = await supabase
    .from("tenants")
    .update({ admin_pin_hash: newHash, admin_pin_updated_at: new Date().toISOString() })
    .eq("id", session.tenant.id);
  if (error) {
    console.error("[admin/pin/change] update failed", { tenantId: session.tenant.id, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
