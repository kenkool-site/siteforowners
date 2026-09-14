import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const INVITATION_OWNER_SESSION_COOKIE = "invitation_owner_session";
export const INVITATION_OWNER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type OwnerSession = {
  ownerId: string;
  expiresAt: number;
};

function getSessionSecret(): string {
  const secret = process.env.SESSION_COOKIE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_COOKIE_SECRET must be set and at least 32 chars");
  }
  return secret;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function isOwnerSession(value: unknown): value is OwnerSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return typeof session.ownerId === "string" && typeof session.expiresAt === "number";
}

export function signOwnerSession(session: OwnerSession, secret = getSessionSecret()): string {
  const body = encodeBase64Url(JSON.stringify(session));
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOwnerSession(
  signed: string,
  secret = getSessionSecret(),
  now = Math.floor(Date.now() / 1000),
): OwnerSession | null {
  try {
    const [body, signature, extra] = signed.split(".");
    if (!body || !signature || extra) return null;
    const expected = createHmac("sha256", secret).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const parsed: unknown = JSON.parse(decodeBase64Url(body));
    if (!isOwnerSession(parsed) || parsed.expiresAt <= now) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createEditToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashEditToken(token) };
}

export function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyEditToken(token: string, storedHash: string): boolean {
  const actual = Buffer.from(hashEditToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function setOwnerSessionCookie(response: NextResponse, ownerId: string): void {
  const expiresAt = Math.floor(Date.now() / 1000) + INVITATION_OWNER_SESSION_MAX_AGE_SECONDS;
  response.cookies.set(
    INVITATION_OWNER_SESSION_COOKIE,
    signOwnerSession({ ownerId, expiresAt }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: INVITATION_OWNER_SESSION_MAX_AGE_SECONDS,
      path: "/",
    },
  );
}

export function clearOwnerSessionCookie(response: NextResponse): void {
  response.cookies.set(INVITATION_OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}

export function readOwnerSession(request: NextRequest): OwnerSession | null {
  const signed = request.cookies.get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  return signed ? verifyOwnerSession(signed) : null;
}

export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host");
    const protocol = forwardedProtocol || new URL(request.url).protocol.replace(":", "");
    if (!host || (protocol !== "http" && protocol !== "https")) return false;
    return originUrl.origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
