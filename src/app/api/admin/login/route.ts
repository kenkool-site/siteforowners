import { NextRequest, NextResponse } from "next/server";
import { resolveTenantByHost, verifyPin, setSessionCookie } from "@/lib/admin-auth";
import {
  hashIp,
  getRateLimitState,
  decide,
  recordAttempt,
  getTenantFailCount,
} from "@/lib/admin-rate-limit";

const TENANT_FAIL_WINDOW_SECONDS = 60 * 60; // 1 hour
const TENANT_FAIL_MAX = 50;

export async function POST(request: NextRequest) {
  let pin: string | undefined;
  try {
    const body = await request.json();
    pin = typeof body?.pin === "string" ? body.pin : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!pin || !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }

  const hostname = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(hostname);
  if (!tenant || !tenant.admin_pin_hash) {
    // Don't reveal whether tenant exists or PIN is set
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const ipHash = hashIp(ip);

  // Per-(tenant, IP) pre-check (don't record yet — we haven't attempted)
  const preState = await getRateLimitState(tenant.id, ipHash);
  const pre = decide(preState, Math.floor(Date.now() / 1000));
  if (!pre.allow) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  // Per-tenant total-failures cap. Closes the IP-rotation bypass:
  // even if an attacker spreads attempts across many IPs, the tenant-wide
  // failure count trips a global lockout once over TENANT_FAIL_MAX.
  const tenantFails = await getTenantFailCount(tenant.id, TENANT_FAIL_WINDOW_SECONDS);
  if (tenantFails >= TENANT_FAIL_MAX) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 }
    );
  }

  const ok = await verifyPin(pin, tenant.admin_pin_hash);
  await recordAttempt(tenant.id, ipHash, ok);
  if (!ok) return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, tenant.id);
  return res;
}
