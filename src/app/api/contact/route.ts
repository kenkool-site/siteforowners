import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, hashIp, getClientIp } from "@/lib/api-rate-limit";

const CONTACT_WINDOW_SECONDS = 60 * 60; // 1 hour
const CONTACT_MAX_REQUESTS = 10;

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  if (!tenant) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(
    `contact:${tenant.id}:${ipHash}`,
    CONTACT_WINDOW_SECONDS,
    CONTACT_MAX_REQUESTS
  );
  if (!allowed) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const b = body as Record<string, unknown>;
  const name = str(b.name);
  const message = str(b.message);
  const phone = str(b.phone);
  const email = str(b.email);
  const source_page = str(b.source_page);

  if (!name || !message) {
    return NextResponse.json({ error: "Name and message are required" }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ error: "Phone or email is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("contact_leads").insert({
    tenant_id: tenant.id,
    name,
    phone,
    email,
    message,
    source_page,
  });
  if (error) {
    console.error("[api/contact] insert failed", { tenantId: tenant.id, error });
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
