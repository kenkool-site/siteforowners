import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPin } from "@/lib/admin-auth";
import { randomInt } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generatePin(): string {
  // 6-digit PIN, leading zeros allowed
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function requireFounder(request: NextRequest): boolean {
  const cookie = request.cookies.get("admin_session")?.value;
  return !!cookie && cookie === process.env.ADMIN_PASSWORD;
}

function sameOriginCheck(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Some same-origin clients don't send Origin
  try {
    const originHost = new URL(origin).host;
    return originHost === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!requireFounder(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sameOriginCheck(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let tenantId: string | undefined;
  try {
    const body = await request.json();
    tenantId = typeof body?.tenantId === "string" ? body.tenantId : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const pin = generatePin();
  const hash = await hashPin(pin);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({
      admin_pin_hash: hash,
      admin_pin_updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId)
    .select("id");

  if (error) {
    console.error("[admin/pin/set] update failed", { tenantId, error });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  // Return the plaintext PIN once so founder can copy it
  return NextResponse.json({ pin });
}
