import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPinResetEmail } from "@/lib/email";
import { checkRateLimit, hashIp, getClientIp } from "@/lib/api-rate-limit";
import { createHash, randomBytes } from "node:crypto";

const FORGOT_WINDOW_SECONDS = 60 * 60; // 1 hour
const FORGOT_MAX_REQUESTS = 5;
const TOKEN_TTL_MINUTES = 15;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(host);
  // Generic response either way — don't reveal whether the host or email matched.
  const genericResponse = NextResponse.json({ ok: true });
  if (!tenant) return genericResponse;

  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(
    `pin_forgot:${tenant.id}:${ipHash}`,
    FORGOT_WINDOW_SECONDS,
    FORGOT_MAX_REQUESTS
  );
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const email = typeof (body as Record<string, unknown>).email === "string"
    ? ((body as Record<string, unknown>).email as string).trim().toLowerCase()
    : "";
  if (!email) return genericResponse;

  const tenantEmails = [tenant.email, tenant.admin_email]
    .filter((e): e is string => Boolean(e))
    .map((e) => e.toLowerCase());
  if (!tenantEmails.includes(email)) return genericResponse;

  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const { error: insertErr } = await supabase
    .from("admin_pin_resets")
    .insert({ token_hash: tokenHash, tenant_id: tenant.id, expires_at: expiresAt });
  if (insertErr) {
    console.error("[admin/pin/forgot] insert failed", { tenantId: tenant.id, error: insertErr });
    return genericResponse;
  }

  const proto = request.headers.get("x-forwarded-proto") || "https";
  const resetUrl = `${proto}://${host}/admin/pin-reset?token=${encodeURIComponent(token)}`;
  await sendPinResetEmail(email, resetUrl, tenant.business_name);

  return genericResponse;
}
