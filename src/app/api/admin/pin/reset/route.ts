import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost, hashPin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const token = typeof b.token === "string" ? b.token : "";
  const newPin = typeof b.newPin === "string" ? b.newPin : "";
  if (!token || !/^\d{4,8}$/.test(newPin)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const tokenHash = hashToken(token);
  const { data: row } = await supabase
    .from("admin_pin_resets")
    .select("tenant_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!row || row.tenant_id !== tenant.id || row.used_at !== null || new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  }

  const newHash = await hashPin(newPin);
  const { error: updateTokenErr } = await supabase
    .from("admin_pin_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  if (updateTokenErr) {
    console.error("[admin/pin/reset] mark used failed", { error: updateTokenErr });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const { error: updatePinErr } = await supabase
    .from("tenants")
    .update({ admin_pin_hash: newHash, admin_pin_updated_at: new Date().toISOString() })
    .eq("id", tenant.id);
  if (updatePinErr) {
    console.error("[admin/pin/reset] PIN update failed", { error: updatePinErr });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
