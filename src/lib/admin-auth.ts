import { scrypt, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(pin, salt, KEY_BYTES)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(":");
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
    const actual = (await scryptAsync(pin, salt, KEY_BYTES)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export type SessionPayload = { tenant_id: string; exp: number };

function getSecret(): string {
  const s = process.env.SESSION_COOKIE_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return s;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signSession(payload: SessionPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function verifySession(signed: string): SessionPayload | null {
  const secret = getSecret();  // throws if missing — that's correct
  try {
    if (!signed || !signed.includes(".")) return null;
    const parts = signed.split(".");
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = createHmac("sha256", secret).update(body).digest();
    const sigBuf = Buffer.from(sig, "hex");
    if (sigBuf.length !== expected.length) return null;
    if (!timingSafeEqual(sigBuf, expected)) return null;
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as SessionPayload;
    if (!payload.tenant_id || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export type BookingModePolicy = "in_site_only" | "external_only" | "both";

export type AdminTenant = {
  id: string;
  business_name: string;
  owner_name: string;
  preview_slug: string | null;
  email: string | null;
  admin_email: string | null;
  admin_pin_hash: string | null;
  subscription_status: string;
  site_published: boolean;
  booking_tool: string | null;
  checkout_mode: string | null;
  booking_mode: BookingModePolicy;
};

/**
 * Resolve the tenant from a request hostname.
 * Looks up custom_domain first (authoritative for mapped domains),
 * then falls back to subdomain for *.siteforowners.com tenants.
 */
export async function resolveTenantByHost(hostname: string): Promise<AdminTenant | null> {
  const normalized = hostname.split(":")[0].replace(/^www\./, "");
  const supabase = createAdminClient();

  const byCustom = await supabase
    .from("tenants")
    .select(
      "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode, booking_mode"
    )
    .eq("custom_domain", normalized)
    .maybeSingle();

  if (byCustom.error) {
    console.error("[resolveTenantByHost] custom_domain lookup failed", { hostname: normalized, error: byCustom.error });
  }

  if (byCustom.data) {
    return byCustom.data as AdminTenant;
  }

  const subdomain = normalized.split(".")[0];
  if (!subdomain) return null;

  const bySub = await supabase
    .from("tenants")
    .select(
      "id, business_name, owner_name, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode, booking_mode"
    )
    .eq("subdomain", subdomain)
    .maybeSingle();

  if (bySub.error) {
    console.error("[resolveTenantByHost] subdomain lookup failed", { hostname: normalized, subdomain, error: bySub.error });
  }

  return (bySub.data as AdminTenant) ?? null;
}

const SESSION_COOKIE = "owner_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function setSessionCookie(res: NextResponse, tenant_id: string): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const signed = signSession({ tenant_id, exp });
  res.cookies.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

/**
 * Validates the session cookie on a request and returns tenant_id + the tenant row.
 * Returns null if missing or invalid. The tenant check ensures the cookie's
 * tenant_id still matches the request hostname — mitigates stolen-cookie replay
 * against a different tenant domain.
 */
export async function requireOwnerSession(
  request: NextRequest | Request
): Promise<{ tenant: AdminTenant } | null> {
  const cookieHeader =
    typeof (request as NextRequest).cookies?.get === "function"
      ? (request as NextRequest).cookies.get(SESSION_COOKIE)?.value
      : parseCookieHeader(request.headers.get("cookie") || "")[SESSION_COOKIE];

  if (!cookieHeader) return null;
  const payload = verifySession(cookieHeader);
  if (!payload) return null;

  const hostname = request.headers.get("host") || "";
  const tenant = await resolveTenantByHost(hostname);
  if (!tenant) return null;
  if (tenant.id !== payload.tenant_id) return null;

  return { tenant };
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("="));
  }
  return out;
}
